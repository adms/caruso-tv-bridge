// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
package tw.local.carusomessages;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
/** Bounded, JSON-only, connection-close local control transport. No browser-origin access. */
public final class LocalHttp implements AutoCloseable {
 public interface Handler { Reply handle(String path,Map<String,String> headers,byte[] body)throws Exception; }
 public static final class Reply {final int code;final String json;public Reply(int c,String j){code=c;json=j;} }
 private final ServerSocket server;private final ThreadPoolExecutor pool=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<Runnable>(4));private volatile boolean closed;
 public LocalHttp(int port,Handler handler)throws IOException{server=new ServerSocket();server.setReuseAddress(true);server.bind(new InetSocketAddress(port));Thread t=new Thread(()->{while(!closed)try{Socket s=server.accept();try{pool.execute(()->serve(s,handler));}catch(RejectedExecutionException e){s.close();}}catch(IOException e){if(!closed)close();}},"tv-messages-http");t.setDaemon(true);t.start();}
 public int port(){return server.getLocalPort();}
 private static String line(InputStream in,int max)throws IOException{ByteArrayOutputStream b=new ByteArrayOutputStream();int previous=-1;for(int i=0;i<max;i++){int c=in.read();if(c<0)throw new EOFException();if(previous==13&&c==10){byte[] bytes=b.toByteArray();return new String(bytes,0,bytes.length-1,StandardCharsets.US_ASCII);}b.write(c);previous=c;}throw new IOException("Header too long");}
 private void serve(Socket socket,Handler handler){try(Socket s=socket){s.setSoTimeout(3000);InputStream in=s.getInputStream();Reply reply;
  try{String[] request=line(in,1024).split(" ");if(request.length!=3||!request[0].equals("POST")||!request[2].equals("HTTP/1.1"))throw new IOException("POST required");
   Map<String,String> h=new HashMap<>();int size=0;for(int n=0;;n++){String l=line(in,2048);if(l.isEmpty())break;size+=l.length();if(n>=32||size>8192)throw new IOException("Too many headers");int colon=l.indexOf(':');if(colon<=0)throw new IOException("Invalid header");String key=l.substring(0,colon).trim().toLowerCase(Locale.ROOT);if(h.put(key,l.substring(colon+1).trim())!=null)throw new IOException("Duplicate header");}
   if(h.containsKey("origin")||h.containsKey("sec-fetch-site"))reply=new Reply(403,"{\"error\":\"Browser requests forbidden\"}");
   else{if(h.containsKey("transfer-encoding")||!"application/json".equals(h.get("content-type")))throw new IOException("JSON with Content-Length required");int n=Integer.parseInt(h.getOrDefault("content-length","-1"));if(n<0||n>8192)throw new IOException("Invalid body length");byte[] b=new byte[n];new DataInputStream(in).readFully(b);reply=handler.handle(request[1],h,b);}
  }catch(Exception e){reply=new Reply(400,"{\"error\":\"Invalid request\"}");}
  byte[] out=reply.json.getBytes(StandardCharsets.UTF_8);OutputStream stream=s.getOutputStream();stream.write(("HTTP/1.1 "+reply.code+" Result\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\nContent-Length: "+out.length+"\r\n\r\n").getBytes(StandardCharsets.US_ASCII));stream.write(out);stream.flush();
 }catch(IOException ignored){} }
 public void close(){closed=true;try{server.close();}catch(IOException ignored){}pool.shutdownNow();}
}
