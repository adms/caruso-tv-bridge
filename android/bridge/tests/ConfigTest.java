// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
import tw.local.carusobridge.*;
public final class ConfigTest {
 static void check(boolean b,String message){if(!b)throw new AssertionError(message);}
 public static void main(String[] args){
  for(String bad:new String[]{"","127.0.0.1","8.8.8.8","10.0.0.999","10.0.0.01","10.0.0.1;echo test","example.test"})
   check(!BridgeConfig.privateIpv4(bad),"invalid host rejected");
  for(String good:new String[]{"10.0.0.123","172.16.0.1","192.168.1.1"})check(BridgeConfig.privateIpv4(good),"private host accepted");
  try{new BridgeConfig("10.0.0.123","/dev/input/event1;id","name",1,4);throw new AssertionError("unsafe device accepted");}catch(IllegalArgumentException expected){}
  CecEvents c=new CecEvents(8,2);
  check(c.wake("80:04")&&c.wake("8F:82:20:00"),"configured CEC source and HDMI");
  check(!c.wake("40:04")&&!c.wake("8F:82:30:00"),"other CEC device and HDMI excluded");
  c.accept("");check(c.accept("[R] time=2000-01-01 00:00:00 message=<Active Source> 8F:82:20:00").size()==1,"configured parser");
  VolumeGestures g=new VolumeGestures("/dev/input/event7");
  check(g.accept(RemoteEvent.parse("[ 1.000000] /dev/input/event1: EV_KEY KEY_VOLUMEDOWN DOWN"),1000)==null,"other IR ignored");
  check(g.accept(RemoteEvent.parse("[ 1.000000] /dev/input/event7: EV_KEY KEY_VOLUMEDOWN DOWN"),1000)!=null,"configured IR accepted");
  System.out.println("PASS: explicit private host, safe input fields, configurable CEC and IR routing");
 }
}
