// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
package tw.local.carusotv;
import android.content.Context;
import android.util.Base64;
import com.cgutman.adblib.*;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
/** A separate TV-only key. Always connects to 127.0.0.1; never imports the Mac's key. */
final class LocalAdb implements AutoCloseable {
 private final Socket socket=new Socket();private final Timer timer=new Timer(true);private AdbConnection connection;
 static AdbCrypto crypto(Context context)throws Exception{
  File dir=context.getNoBackupFilesDir(),priv=new File(dir,"tv-adb-private.der"),pub=new File(dir,"tv-adb-public.der");AdbBase64 b=bytes->Base64.encodeToString(bytes,Base64.NO_WRAP);
  if(priv.exists()&&pub.exists())return AdbCrypto.loadAdbKeyPair(b,priv,pub);
  AdbCrypto c=AdbCrypto.generateAdbKeyPair(b);c.saveAdbKeyPair(priv,pub);return c;
 }
 static String fingerprint(Context context)throws Exception{
  String payload=new String(crypto(context).getAdbPublicKeyPayload(),"UTF-8");byte[] key=Base64.decode(payload.substring(0,payload.indexOf(' ')),Base64.NO_WRAP);byte[] sum=MessageDigest.getInstance("MD5").digest(key);StringBuilder s=new StringBuilder();for(byte b:sum){if(s.length()>0)s.append(':');s.append(String.format(Locale.ROOT,"%02X",b&255));}return s.toString();
 }
 LocalAdb(Context context,int deadlineSeconds)throws Exception{
  timer.schedule(new TimerTask(){public void run(){try{socket.close();}catch(IOException ignored){}}},deadlineSeconds*1000L);
  try{socket.connect(new InetSocketAddress("127.0.0.1",5555),3000);connection=AdbConnection.create(socket,crypto(context));connection.connect();}catch(Exception e){close();throw e;}
 }
 String shell(String command)throws Exception{
  if(command.length()>8192)throw new IOException("Command too long");ByteArrayOutputStream out=new ByteArrayOutputStream();
  try(AdbStream stream=connection.open("shell,raw:"+command)){
   for(;;){try{byte[] b=stream.read();if(out.size()+b.length>65536)throw new IOException("Response too large");out.write(b);}catch(IOException e){if(stream.isClosed())break;throw e;}}
  }
  return out.toString("UTF-8");
 }
 static String quote(String s){return "'"+s.replace("'","'\\''")+"'";}
 public void close(){timer.cancel();try{socket.close();}catch(IOException ignored){}if(connection!=null)try{connection.close();}catch(IOException ignored){}}
}
