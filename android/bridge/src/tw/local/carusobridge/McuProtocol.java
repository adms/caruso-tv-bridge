// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
package tw.local.carusobridge;
import java.io.*;
import java.nio.charset.StandardCharsets;
/** Independently implemented limited Caruso TCP 50001 codec. No DSP/settings setters. */
public final class McuProtocol {
 public static final int MASTER=0xc2, OPTICAL=0xc20c;
 private McuProtocol(){}
 public static byte[] displayQuery(){return frame(0,0x3f,new byte[0]);}
 public static byte[] powerOn(){return frame(MASTER,0xd7,new byte[0]);}
 // Verified Caruso app power-button command; caller MUST re-read power before using a toggle.
 public static byte[] powerButton(){return frame(MASTER,0x81,new byte[0]);}
 public static byte[] keepAlive(){return frame(MASTER,0x3f,new byte[]{(byte)MASTER,0,(byte)0xf5});}
 public static byte[] optical(){return frame(MASTER,0xde,new byte[0]);}
 public static byte[] volumeStep(int delta){if(delta!=1&&delta!=-1)throw new IllegalArgumentException("Unit step required");return frame(MASTER,delta==1?0x80:0xa0,new byte[0]);}
 private static byte[] frame(int to,int command,byte[] data){byte[] b=new byte[6+data.length];b[0]=(byte)0xa9;b[1]=(byte)to;b[2]=(byte)0xee;b[3]=(byte)(1+data.length);b[4]=(byte)command;System.arraycopy(data,0,b,5,data.length);int sum=0;for(int i=0;i<b.length-1;i++)sum+=b[i]&255;b[b.length-1]=(byte)sum;return b;}
 public static final class Packet{
  public int type,to,from,command;public byte[] data;
  public int sourceId(){return data.length>=3?((data[0]&255)<<8)|(data[1]&255):-1;}
  public int info(){return data.length>=3?data[2]&255:-1;}
 }
 public static Packet read(InputStream stream)throws IOException{
  DataInputStream in=new DataInputStream(stream);Packet p=new Packet();p.type=in.readUnsignedByte();p.command=-1;p.data=new byte[0];
  if(p.type==0x99||p.type==0x96||p.type==0x95||p.type==0x69||p.type==0x66)return p;
  if(p.type!=0xa9&&p.type!=0xa8)throw new IOException("Unknown MCU packet type");
  p.to=in.readUnsignedByte();p.from=in.readUnsignedByte();int n=in.readUnsignedByte();if(n==0)n=in.readUnsignedShort();int size=p.type==0xa8?2:1;if(n<size||n>8192)throw new IOException("MCU length out of bounds");
  byte[] body=new byte[n];in.readFully(body);int actual=in.readUnsignedByte(),sum=p.type+p.to+p.from+(n&255)+(n>>8);for(byte b:body)sum+=b&255;if((sum&255)!=actual)throw new IOException("MCU checksum mismatch");
  p.command=body[0]&255;if(size==2)p.command|=(body[1]&255)<<8;p.data=new byte[n-size];System.arraycopy(body,size,p.data,0,p.data.length);return p;
 }
 public static final class State {
  public int volume=-1,maxVolume=-1,source=-1;public Boolean on=null;public boolean comfortStandby=false;public boolean opticalVerified=false,masterVerified=false;
  public long volumeAt=0,powerAt=0,sourceAt=0;
  public void accept(Packet p,long now){
   if(p.to!=0xee||p.from!=MASTER||p.command!=0x3f||p.data.length<3)return;
   int sourceId=p.sourceId(),id=p.info();byte[] d=p.data;
   if(id==1&&sourceId==OPTICAL&&d.length>=4){String name=new String(d,4,d.length-4,StandardCharsets.UTF_8).trim();opticalVerified=(d[3]&255)==0x5e&&name.equals("OPTICAL");}
   if(sourceId==0xc200&&id==5&&d.length>=6){int v=d[3]&255,m=d[5]&255;if(m==63&&v<=m){volume=v;maxVolume=m;masterVerified=true;volumeAt=now;}else{volume=-1;masterVerified=false;}}
   if(sourceId==0xc200&&id==2&&d.length>=4){int count=d.length-3;int bits=d[3]&255;if(count==2)bits=(bits<<8)|(d[4]&255);else if(count>=3)bits|=((d[4]&255)<<8)|((d[5]&255)<<16);on=(bits&128)!=0;comfortStandby=(bits&(1<<17))!=0;powerAt=now;}
   if(id==8){source=sourceId;sourceAt=now;}
  }
  public String description(){return "power="+on+"; comfortStandby="+comfortStandby+"; volume="+volume+"/"+maxVolume+"; source="+Integer.toHexString(source)+"; opticalVerified="+opticalVerified;}
 }
}
