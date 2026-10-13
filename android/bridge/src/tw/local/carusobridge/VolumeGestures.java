// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
package tw.local.carusobridge;
/** Holds use a bounded software repeat because this Sony IR device sends down/up only. */
public final class VolumeGestures {
 public static final class Step {
  public final int delta;public final long time,token;public final boolean repeat;
  Step(int d,long t,long g,boolean r){delta=d;time=t;token=g;repeat=r;}
 }
 private final String inputDevice;
 public VolumeGestures(){this("/dev/input/event1");}
 public VolumeGestures(String inputDevice){this.inputDevice=inputDevice;}
 private int held;private long downAt,nextRepeat,token;private boolean cancelled;
 public synchronized Step accept(RemoteEvent e,long now){
  if(!e.device.equals(inputDevice))return null;
  if(e.kernelMs>now+50||now-e.kernelMs>1000){clear();return null;}
  int d=e.key.equals("KEY_VOLUMEUP")?1:e.key.equals("KEY_VOLUMEDOWN")?-1:0;
  if(d==0){if(e.action.equals("down"))clear();return null;}
  if(e.action.equals("up")){if(held==d)held=0;return null;}
  if(!e.action.equals("down")||held==d)return null;
  held=d;downAt=e.kernelMs;nextRepeat=now+600;token++;cancelled=false;return new Step(d,e.kernelMs,token,false);
 }
 public synchronized Step repeat(long now){if(held==0||cancelled||now-downAt>2500)return null;if(now<nextRepeat)return null;nextRepeat=now+300;return new Step(held,now,token,true);}
 public synchronized boolean valid(Step s,long now){return !cancelled&&now>=s.time-50&&now-s.time<=1000&&(!s.repeat||(held==s.delta&&token==s.token&&now-downAt<=2500));}
 public synchronized void clear(){held=0;cancelled=true;token++;}
}
