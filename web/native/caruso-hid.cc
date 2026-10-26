// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
// In-process N-API bridge: Input Monitoring belongs to the signed application, not a child executable.
#include <node_api.h>
#include <IOKit/hid/IOHIDManager.h>
#include <IOKit/hidsystem/IOHIDLib.h>
#include <CoreFoundation/CoreFoundation.h>
#include <atomic>
#include <thread>
#include <mutex>
#include <string>
struct Event {std::string type;int value;bool flag;};
static std::thread worker;
static std::mutex lock;
static CFRunLoopRef loop=nullptr;
static std::atomic<bool> running(false);
static napi_threadsafe_function callback=nullptr;
static void jsEvent(napi_env env,napi_value fn,void*,void* raw){Event* e=static_cast<Event*>(raw);if(env&&fn){napi_value obj,type,v,flag,global;napi_create_object(env,&obj);napi_create_string_utf8(env,e->type.c_str(),NAPI_AUTO_LENGTH,&type);napi_set_named_property(env,obj,"type",type);napi_create_int32(env,e->value,&v);napi_get_boolean(env,e->flag,&flag);
 if(e->type=="key"){napi_set_named_property(env,obj,"usage",v);napi_set_named_property(env,obj,"down",flag);}else if(e->type=="device")napi_set_named_property(env,obj,"connected",flag);else{napi_set_named_property(env,obj,"access",v);napi_set_named_property(env,obj,"granted",flag);}
 napi_get_global(env,&global);napi_call_function(env,global,fn,1,&obj,nullptr);}delete e;}
static void emit(std::string type,int value,bool flag){auto* e=new Event{type,value,flag};if(!callback||napi_call_threadsafe_function(callback,e,napi_tsfn_nonblocking)!=napi_ok)delete e;}
static void device(void*,IOReturn,void*,IOHIDDeviceRef){emit("device",0,true);}
static void removed(void*,IOReturn,void*,IOHIDDeviceRef){emit("device",0,false);}
static void input(void*,IOReturn,void*,IOHIDValueRef value){IOHIDElementRef e=IOHIDValueGetElement(value);uint32_t page=IOHIDElementGetUsagePage(e),usage=IOHIDElementGetUsage(e);if(page!=12)return;if(usage!=0xe9&&usage!=0xea&&usage!=0xe2&&usage!=0xcd&&usage!=0xb0&&usage!=0xb1&&usage!=0xb7)return;emit("key",usage,IOHIDValueGetIntegerValue(value)>0);}
static void stopWorker(){running=false;{std::lock_guard<std::mutex> guard(lock);if(loop)CFRunLoopStop(loop);}if(worker.joinable())worker.join();}
static napi_value stop(napi_env env,napi_callback_info){stopWorker();napi_value u;napi_get_undefined(env,&u);return u;}
static napi_value granted(napi_env env,napi_callback_info){napi_value b;napi_get_boolean(env,IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)==kIOHIDAccessTypeGranted,&b);return b;}
static napi_value request(napi_env env,napi_callback_info){napi_value b;napi_get_boolean(env,IOHIDRequestAccess(kIOHIDRequestTypeListenEvent),&b);return b;}
static napi_value start(napi_env env,napi_callback_info info){size_t n=3;napi_value args[3];napi_get_cb_info(env,info,&n,args,nullptr,nullptr);int32_t vendor,product;napi_valuetype kind;
 if(n!=3||napi_get_value_int32(env,args[0],&vendor)!=napi_ok||napi_get_value_int32(env,args[1],&product)!=napi_ok||vendor<0||vendor>65535||product<0||product>65535||napi_typeof(env,args[2],&kind)!=napi_ok||kind!=napi_function){napi_throw_type_error(env,nullptr,"USB VID, PID and callback required");return nullptr;}
 stopWorker();napi_value name;napi_create_string_utf8(env,"Caruso USB knob",NAPI_AUTO_LENGTH,&name);
 napi_threadsafe_function stream;if(napi_create_threadsafe_function(env,args[2],nullptr,name,64,1,nullptr,nullptr,nullptr,jsEvent,&stream)!=napi_ok)return nullptr;
 callback=stream;napi_unref_threadsafe_function(env,stream);running=true;
 worker=std::thread([vendor,product,stream](){IOHIDManagerRef manager=IOHIDManagerCreate(kCFAllocatorDefault,kIOHIDOptionsTypeNone);int page=12;CFNumberRef vid=CFNumberCreate(nullptr,kCFNumberIntType,&vendor),pid=CFNumberCreate(nullptr,kCFNumberIntType,&product),usage=CFNumberCreate(nullptr,kCFNumberIntType,&page);
 const void* keys[]={CFSTR(kIOHIDVendorIDKey),CFSTR(kIOHIDProductIDKey),CFSTR(kIOHIDPrimaryUsagePageKey)};const void* values[]={vid,pid,usage};CFDictionaryRef match=CFDictionaryCreate(nullptr,keys,values,3,&kCFTypeDictionaryKeyCallBacks,&kCFTypeDictionaryValueCallBacks);IOHIDManagerSetDeviceMatching(manager,match);CFRelease(match);CFRelease(vid);CFRelease(pid);CFRelease(usage);
 IOHIDManagerRegisterDeviceMatchingCallback(manager,device,nullptr);IOHIDManagerRegisterDeviceRemovalCallback(manager,removed,nullptr);IOHIDManagerRegisterInputValueCallback(manager,input,nullptr);
 CFRunLoopRef own=CFRunLoopGetCurrent();{std::lock_guard<std::mutex> guard(lock);loop=own;}
 IOHIDManagerScheduleWithRunLoop(manager,own,kCFRunLoopDefaultMode);IOReturn opened=IOHIDManagerOpen(manager,kIOHIDOptionsTypeNone);emit("ready",static_cast<int>(IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)),IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)==kIOHIDAccessTypeGranted);if(opened!=kIOReturnSuccess)emit("openError",opened,false);else emit("opened",opened,true);CFSetRef devices=IOHIDManagerCopyDevices(manager);emit("device",0,devices&&CFSetGetCount(devices)>0);if(devices)CFRelease(devices);
 while(running)CFRunLoopRunInMode(kCFRunLoopDefaultMode,.25,false);
 IOHIDManagerClose(manager,kIOHIDOptionsTypeNone);IOHIDManagerUnscheduleFromRunLoop(manager,own,kCFRunLoopDefaultMode);CFRelease(manager);{std::lock_guard<std::mutex> guard(lock);loop=nullptr;}
 napi_release_threadsafe_function(stream,napi_tsfn_abort);
 });napi_value u;napi_get_undefined(env,&u);return u;}
static void cleanup(void*){stopWorker();}
static napi_value init(napi_env env,napi_value exports){napi_property_descriptor props[]={{"start",nullptr,start,nullptr,nullptr,nullptr,napi_default,nullptr},{"stop",nullptr,stop,nullptr,nullptr,nullptr,napi_default,nullptr},{"checkAccess",nullptr,granted,nullptr,nullptr,nullptr,napi_default,nullptr},{"requestAccess",nullptr,request,nullptr,nullptr,nullptr,napi_default,nullptr}};napi_define_properties(env,exports,4,props);napi_add_env_cleanup_hook(env,cleanup,nullptr);return exports;}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
