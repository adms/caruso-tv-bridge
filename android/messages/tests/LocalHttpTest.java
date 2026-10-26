// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import tw.local.carusomessages.LocalHttp;import java.net.*;import java.io.*;import java.nio.charset.StandardCharsets;import java.util.concurrent.atomic.AtomicInteger;
public class LocalHttpTest {
 static String request(int port,String input)throws Exception{try(Socket s=new Socket("127.0.0.1",port)){s.setSoTimeout(3000);s.getOutputStream().write(input.getBytes(StandardCharsets.UTF_8));s.shutdownOutput();ByteArrayOutputStream b=new ByteArrayOutputStream();byte[] buf=new byte[1024];int n;while((n=s.getInputStream().read(buf))>=0)b.write(buf,0,n);return b.toString("UTF-8");}}
 static void check(boolean b){if(!b)throw new AssertionError();}
 public static void main(String[] a)throws Exception{AtomicInteger calls=new AtomicInteger();try(LocalHttp server=new LocalHttp(0,(p,h,b)->{calls.incrementAndGet();return new LocalHttp.Reply(200,"{\"ok\":true}");})){
 String base="POST /status HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 2\r\n";
 check(request(server.port(),base+"\r\n{}").startsWith("HTTP/1.1 200"));check(calls.get()==1);
 check(request(server.port(),base+"Origin: https://evil.test\r\n\r\n{}").startsWith("HTTP/1.1 403"));
 check(request(server.port(),base+"Content-Length: 2\r\n\r\n{}").startsWith("HTTP/1.1 400"));
 check(request(server.port(),base+"Transfer-Encoding: chunked\r\n\r\n{}").startsWith("HTTP/1.1 400"));
 check(request(server.port(),"POST /message HTTP/1.1\r\nContent-Type: application/json\r\nContent-Length: 99999\r\n\r\n").startsWith("HTTP/1.1 400"));
 check(request(server.port(),"GET /status HTTP/1.1\r\n\r\n").startsWith("HTTP/1.1 400"));check(calls.get()==1);
 }System.out.println("LocalHttp: valid JSON request, browser-origin rejection, duplicate length, chunked, oversize and method checks passed");}
}
