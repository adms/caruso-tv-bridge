-- Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
use framework "Foundation"
use scripting additions
on encodeJSON(value)
 set dataValue to current application's NSJSONSerialization's dataWithJSONObject:value options:0 |error|:(missing value)
 return (current application's NSString's alloc()'s initWithData:dataValue encoding:(current application's NSUTF8StringEncoding)) as text
end encodeJSON
on packet(keysList, valuesList)
 set dictionaryValue to current application's NSMutableDictionary's dictionary()
 repeat with i from 1 to count keysList
  set v to item i of valuesList
  if v is missing value then set v to current application's NSNull's null()
  dictionaryValue's setObject:v forKey:(item i of keysList)
 end repeat
 return dictionaryValue
end packet
on run argv
 set stepName to "input"
 try
  set rawData to (current application's NSString's stringWithString:(item 1 of argv))'s dataUsingEncoding:(current application's NSUTF8StringEncoding)
  set input to current application's NSJSONSerialization's JSONObjectWithData:rawData options:0 |error|:(missing value)
  set verb to (input's objectForKey:"action") as text
  set provider to input's objectForKey:"provider"
  if provider is not missing value and (provider as text) is "spotify" then
   tell application id "com.spotify.client"
    if verb is "play" then
     set requestedURI to input's objectForKey:"uri"
     if requestedURI is missing value then
      play
     else
      play track (requestedURI as text)
     end if
    else if verb is "pause" then
     pause
    else if verb is "next" then
     next track
    else if verb is "previous" then
     previous track
    else if verb is not "status" then
     return my encodeJSON(my packet({"ok", "code"}, {false, "action"}))
    end if
    set resultState to player state as text
    set trackInfo to missing value
    try
     set trackInfo to my packet({"title", "artist", "uri"}, {name of current track, artist of current track, id of current track})
    end try
   end tell
   return my encodeJSON(my packet({"ok", "state", "track"}, {true, resultState, trackInfo}))
  end if
  set stepName to "devices"
  tell application id "com.apple.Music"
   set outputs to every AirPlay device
   if verb is "devices" then
    set itemsFound to {}
    repeat with deviceRef in outputs
     if available of deviceRef and supports audio of deviceRef then set end of itemsFound to my packet({"name", "selected", "active"}, {name of deviceRef, selected of deviceRef, active of deviceRef})
    end repeat
    return my encodeJSON(my packet({"ok", "devices"}, {true, itemsFound}))
   end if
   if verb is "search" then
    set stepName to "search"
    set queryText to (input's objectForKey:"query") as text
    set foundTracks to search library playlist 1 for queryText
    set itemsFound to {}
    repeat with i from 1 to (count foundTracks)
     if i > 30 then exit repeat
     set t to item i of foundTracks
     set end of itemsFound to my packet({"id", "title", "artist", "album"}, {persistent ID of t, name of t, artist of t, album of t})
    end repeat
    return my encodeJSON(my packet({"ok", "tracks"}, {true, itemsFound}))
   end if
   set desiredName to input's objectForKey:"target"
   if verb is "pause" or verb is "next" or verb is "previous" then
    set selectedOutputs to current AirPlay devices
    if desiredName is missing value or (count selectedOutputs) is not 1 then return my encodeJSON(my packet({"ok", "code"}, {false, "route"}))
    if name of item 1 of selectedOutputs is not (desiredName as text) then return my encodeJSON(my packet({"ok", "code"}, {false, "route"}))
    if verb is "pause" then
     pause
    else if verb is "next" then
     next track
    else
     previous track
    end if
    return my encodeJSON(my packet({"ok", "state"}, {true, player state as text}))
   end if
   if verb is not "prepare" and verb is not "play" then return my encodeJSON(my packet({"ok", "code"}, {false, "action"}))
   set stepName to "target"
   set matches to {}
   repeat with deviceRef in outputs
    if available of deviceRef and supports audio of deviceRef then
     if desiredName is missing value then
      ignoring case
       if name of deviceRef contains "caruso" then set end of matches to contents of deviceRef
      end ignoring
     else if name of deviceRef is (desiredName as text) then
      set end of matches to contents of deviceRef
     end if
    end if
   end repeat
   if (count matches) is not 1 then return my encodeJSON(my packet({"ok", "code"}, {false, "target"}))
   set chosenDevice to item 1 of matches
   set requestedID to input's objectForKey:"id"
   set chosenTrack to missing value
   set stepName to "track"
   if requestedID is not missing value then
    set requestedText to requestedID as text
    set matchedTracks to every track of library playlist 1 whose persistent ID is requestedText
    if (count matchedTracks) is not 1 then return my encodeJSON(my packet({"ok", "code"}, {false, "track"}))
    set chosenTrack to item 1 of matchedTracks
   else
    try
     set currentID to persistent ID of current track
    on error
     return my encodeJSON(my packet({"ok", "code"}, {false, "empty"}))
    end try
   end if
   set stepName to "route"
   set current AirPlay devices to {chosenDevice}
   set selectedOutputs to current AirPlay devices
   if (count selectedOutputs) is not 1 then return my encodeJSON(my packet({"ok", "code"}, {false, "route"}))
   if name of item 1 of selectedOutputs is not name of chosenDevice then return my encodeJSON(my packet({"ok", "code"}, {false, "route"}))
   set outputName to name of chosenDevice
   if verb is "prepare" then return my encodeJSON(my packet({"ok", "target", "ready"}, {true, outputName, true}))
   set stepName to "play"
   if chosenTrack is missing value then
    play
   else
    play chosenTrack
   end if
   delay 1
   return my encodeJSON(my packet({"ok", "target", "state", "track"}, {true, outputName, player state as text, my packet({"title", "artist"}, {name of current track, artist of current track})}))
  end tell
 on error problem number errorNumber
  set errorCode to "application"
  if errorNumber is -1743 then set errorCode to "permission"
  return my encodeJSON(my packet({"ok", "code", "number", "stage", "reason"}, {false, errorCode, errorNumber, stepName, problem}))
 end try
end run
