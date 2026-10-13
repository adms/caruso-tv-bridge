// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
package tw.local.carusobridge;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
final class TvDiagnostics {
 static String hdmi(File dir)throws Exception{
  java.lang.Process p=new ProcessBuilder("/system/bin/dumpsys","hdmi_control").redirectError(new File(dir,"cec-error.txt")).start();ByteArrayOutputStream out=new ByteArrayOutputStream();AtomicBoolean large=new AtomicBoolean();
  Thread reader=new Thread(()->{try(InputStream in=p.getInputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1){if(out.size()+n>262144){large.set(true);break;}out.write(b,0,n);}}catch(IOException ignored){}});reader.setDaemon(true);reader.start();
  try{if(!p.waitFor(3,TimeUnit.SECONDS))throw new IOException("CEC snapshot timed out");reader.join(1000);if(reader.isAlive()||large.get()||p.exitValue()!=0)throw new IOException("Incomplete CEC snapshot");return new String(out.toByteArray(),StandardCharsets.UTF_8);}finally{if(p.isAlive())p.destroyForcibly();}
 }
}
