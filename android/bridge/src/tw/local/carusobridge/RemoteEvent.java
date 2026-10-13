// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
package tw.local.carusobridge;
import java.util.regex.*;
/** Allowlisted remote events only. Navigation, text and unrelated keys are discarded. */
public final class RemoteEvent {
 private static final Pattern P=Pattern.compile("^\\[\\s*([0-9]+\\.[0-9]+)\\]\\s+(/dev/input/event[0-9]+):\\s+EV_KEY\\s+(KEY_VOLUMEUP|KEY_VOLUMEDOWN|KEY_MUTE|KEY_POWER|KEY_PLAYPAUSE|KEY_PLAY|KEY_PAUSE|KEY_STOPCD)\\s+(DOWN|UP|REPEAT|0000000[012])\\s*$");
 public final long kernelMs;public final String device,key,action;
 RemoteEvent(long t,String d,String k,String a){kernelMs=t;device=d;key=k;action=a;}
 public static RemoteEvent parse(String line){Matcher m=P.matcher(line);if(!m.matches())return null;String s=m.group(4);return new RemoteEvent((long)(Double.parseDouble(m.group(1))*1000),m.group(2),m.group(3),s.equals("DOWN")||s.equals("00000001")?"down":s.equals("UP")||s.equals("00000000")?"up":"repeat");}
 public String description(){return device+" "+key+" "+action+" kernelMs="+kernelMs;}
}
