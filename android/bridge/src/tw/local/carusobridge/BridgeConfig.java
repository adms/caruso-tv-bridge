// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
package tw.local.carusobridge;
/** Explicit local configuration; never guesses a device address. */
public final class BridgeConfig {
 public final String host,inputDevice,inputName;public final int hdmiPort,cecLogical;
 public BridgeConfig(String host,String inputDevice,String inputName,int hdmiPort,int cecLogical){
  if(!privateIpv4(host))throw new IllegalArgumentException("Caruso must have an explicit private IPv4 address");
  if(inputDevice==null||!inputDevice.matches("/dev/input/event[0-9]{1,3}"))throw new IllegalArgumentException("Expected /dev/input/eventN");
  if(inputName==null||!inputName.matches("[A-Za-z0-9_. -]{1,80}"))throw new IllegalArgumentException("Invalid IR device name");
  if(hdmiPort<1||hdmiPort>4||cecLogical<1||cecLogical>14)throw new IllegalArgumentException("Invalid HDMI port or CEC logical address");
  this.host=host;this.inputDevice=inputDevice;this.inputName=inputName;this.hdmiPort=hdmiPort;this.cecLogical=cecLogical;
 }
 public static boolean privateIpv4(String host){
  if(host==null||!host.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))return false;
  String[] parts=host.split("\\.");int[] n=new int[4];for(int i=0;i<4;i++){n[i]=Integer.parseInt(parts[i]);if(n[i]>255||(parts[i].length()>1&&parts[i].startsWith("0")))return false;}
  return n[0]==10||(n[0]==192&&n[1]==168)||(n[0]==172&&n[1]>=16&&n[1]<=31);
 }
}
