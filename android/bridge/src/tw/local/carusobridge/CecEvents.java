// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: MIT
package tw.local.carusobridge;
import java.util.*;
import java.util.regex.*;
/** Baseline is ignored; only newly seen received configured Apple TV HDMI events are returned. */
public final class CecEvents {
 private final Set<String> seen=new LinkedHashSet<>();private boolean initialized=false;
 private final String source;private final String activeSource;private final Pattern event;
 public CecEvents(){this(4,3);}
 public CecEvents(int logical,int hdmiPort){source=Integer.toHexString(logical).toUpperCase(Locale.ROOT);activeSource=String.format(Locale.ROOT,"%sF:82:%02X:00",source,hdmiPort<<4);event=Pattern.compile("^\\[R\\] time=[0-9-]+ [0-9:]+ message=<[^>]+> ("+source+"[0F]:[0-9A-F:]+)$");}
 public List<String> accept(String dump){List<String> out=new ArrayList<>();Set<String> current=new LinkedHashSet<>();for(String raw:dump.split("\\n")){String line=raw.trim();Matcher m=event.matcher(line);if(!m.matches())continue;String code=m.group(1);if(!code.matches(source+"[0F]:(04|0D|36|44|45|82|90|41|42)(:[0-9A-F]{2})*"))continue;if(current.add(line)&&!seen.contains(line)&&initialized)out.add(line);}initialized=true;seen.clear();seen.addAll(current);return out;}

 public static int tvPower(String dump){Matcher m=Pattern.compile("(?m)^\\s*mPowerStatus:\\s*([0-3])\\s*$").matcher(dump);return m.find()?Integer.parseInt(m.group(1)):-1;}
 public boolean wake(String line){return line.endsWith(source+"0:04")||line.endsWith(source+"0:0D")||line.endsWith(activeSource);}
}
