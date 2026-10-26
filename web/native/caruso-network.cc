// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
// Bonjour runs inside the signed app so macOS attributes Local Network access correctly.
#include <node_api.h>
#include <dns_sd.h>
#include <sys/select.h>
#include <arpa/inet.h>
#include <cctype>
#include <atomic>
#include <thread>
#include <vector>
#include <string>
#include <algorithm>
#include <chrono>
struct NetEvent {std::string type,name,host,id;int code=0,port=0;};
static std::thread thread;
static std::atomic<bool> active(false);
static napi_threadsafe_function stream=nullptr;
static void deliver(napi_env env,napi_value callback,void*,void* raw){auto* e=(NetEvent*)raw;if(env&&callback){napi_value out,global;napi_create_object(env,&out);for(auto pair:std::vector<std::pair<const char*,std::string>>{{"type",e->type},{"name",e->name},{"host",e->host},{"identity",e->id}}){napi_value value;napi_create_string_utf8(env,pair.second.c_str(),NAPI_AUTO_LENGTH,&value);napi_set_named_property(env,out,pair.first,value);}for(auto pair:std::vector<std::pair<const char*,int>>{{"code",e->code},{"port",e->port}}){napi_value value;napi_create_int32(env,pair.second,&value);napi_set_named_property(env,out,pair.first,value);}napi_get_global(env,&global);napi_call_function(env,global,callback,1,&out,nullptr);}delete e;}
static void emit(NetEvent e){auto* value=new NetEvent(std::move(e));if(!stream||napi_call_threadsafe_function(stream,value,napi_tsfn_nonblocking)!=napi_ok)delete value;}
struct Search {std::vector<DNSServiceRef> refs;};
static void resolved(DNSServiceRef,DNSServiceFlags,uint32_t,DNSServiceErrorType error,const char* full,const char* host,uint16_t port,uint16_t length,const unsigned char* txt,void*){
 if(error){emit({"error","","","",error});return;}
 std::string identity;for(const char* key:{"deviceid","deviceID","serialNumber"}){uint8_t n=0;const void* value=TXTRecordGetValuePtr(length,txt,key,&n);if(value&&n>0&&n<128){identity.assign((const char*)value,n);break;}}
 emit({"service",full?full:"",host?host:"",identity,0,ntohs(port)});
}
static void browsed(DNSServiceRef,DNSServiceFlags flags,uint32_t interfaceIndex,DNSServiceErrorType error,const char* name,const char* type,const char* domain,void* raw){
 if(error){emit({"error","","","",error});return;}if(!(flags&kDNSServiceFlagsAdd)||!name||!type||!domain)return;
 auto* search=(Search*)raw;std::string lower=name;std::transform(lower.begin(),lower.end(),lower.begin(),[](unsigned char c){return std::tolower(c);});
 if(lower.find("caruso")==std::string::npos||search->refs.size()>=18)return;
 DNSServiceRef ref=nullptr;auto status=DNSServiceResolve(&ref,0,interfaceIndex,name,type,domain,resolved,nullptr);if(status)emit({"error","","","",status});else search->refs.push_back(ref);
}
static void halt(){active=false;if(thread.joinable())thread.join();}
static napi_value stop(napi_env env,napi_callback_info){halt();napi_value value;napi_get_undefined(env,&value);return value;}
static napi_value start(napi_env env,napi_callback_info info){size_t n=1;napi_value args[1];napi_get_cb_info(env,info,&n,args,nullptr,nullptr);napi_valuetype kind;if(n!=1||napi_typeof(env,args[0],&kind)!=napi_ok||kind!=napi_function){napi_throw_type_error(env,nullptr,"Discovery callback required");return nullptr;}halt();napi_value name;napi_create_string_utf8(env,"Caruso LAN discovery",NAPI_AUTO_LENGTH,&name);napi_threadsafe_function callback;
 if(napi_create_threadsafe_function(env,args[0],nullptr,name,64,1,nullptr,nullptr,nullptr,deliver,&callback)!=napi_ok)return nullptr;
 stream=callback;napi_unref_threadsafe_function(env,callback);active=true;
 thread=std::thread([callback](){Search search;for(const char* type:{"_http._tcp","_airplay._tcp","_raop._tcp"}){DNSServiceRef ref=nullptr;auto code=DNSServiceBrowse(&ref,0,0,type,"local.",browsed,&search);if(code)emit({"error","","","",code});else search.refs.push_back(ref);}
  const auto end=std::chrono::steady_clock::now()+std::chrono::seconds(8);
  while(active&&std::chrono::steady_clock::now()<end){fd_set reads;FD_ZERO(&reads);int maxfd=-1;const auto refs=search.refs;for(auto ref:refs){int fd=DNSServiceRefSockFD(ref);if(fd>=0&&fd<FD_SETSIZE){FD_SET(fd,&reads);maxfd=std::max(maxfd,fd);}}if(maxfd<0)break;timeval wait{0,150000};int count=select(maxfd+1,&reads,nullptr,nullptr,&wait);if(count<0)break;if(count>0)for(auto ref:refs){int fd=DNSServiceRefSockFD(ref);if(fd>=0&&fd<FD_SETSIZE&&FD_ISSET(fd,&reads)){auto code=DNSServiceProcessResult(ref);if(code){emit({"error","","","",code});auto it=std::find(search.refs.begin(),search.refs.end(),ref);if(it!=search.refs.end())search.refs.erase(it);DNSServiceRefDeallocate(ref);}}}}
  for(auto ref:search.refs)DNSServiceRefDeallocate(ref);if(active)emit({"finished"});active=false;napi_release_threadsafe_function(callback,napi_tsfn_release);
 });napi_value value;napi_get_undefined(env,&value);return value;
}
static void cleanup(void*){halt();}
static napi_value init(napi_env env,napi_value out){napi_property_descriptor props[]={{"start",nullptr,start,nullptr,nullptr,nullptr,napi_default,nullptr},{"stop",nullptr,stop,nullptr,nullptr,nullptr,napi_default,nullptr}};napi_define_properties(env,out,2,props);napi_add_env_cleanup_hook(env,cleanup,nullptr);return out;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
