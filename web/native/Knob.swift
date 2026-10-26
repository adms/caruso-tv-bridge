// Copyright (c) 2026 Adms Chung
// SPDX-License-Identifier: Apache-2.0
import Foundation
import IOKit.hid
func emit(_ value:[String:Any]) { if let data=try? JSONSerialization.data(withJSONObject:value), let line=String(data:data,encoding:.utf8){print(line);fflush(stdout)} }
let args=CommandLine.arguments
let vendor=Int(args.count>1 ? args[1] : "") ?? -1
let product=Int(args.count>2 ? args[2] : "") ?? -1
guard vendor>=0,product>=0 else {exit(2)}
let manager=IOHIDManagerCreate(kCFAllocatorDefault,IOOptionBits(kIOHIDOptionsTypeNone))
IOHIDManagerSetDeviceMatching(manager,[kIOHIDVendorIDKey:vendor,kIOHIDProductIDKey:product,kIOHIDPrimaryUsagePageKey:12] as CFDictionary)
IOHIDManagerRegisterDeviceMatchingCallback(manager,{_,_,_,_ in emit(["type":"device","connected":true])},nil)
IOHIDManagerRegisterDeviceRemovalCallback(manager,{_,_,_,_ in emit(["type":"device","connected":false])},nil)
IOHIDManagerRegisterInputValueCallback(manager,{_,_,_,value in
 let element=IOHIDValueGetElement(value),page=IOHIDElementGetUsagePage(element),usage=IOHIDElementGetUsage(element)
 guard page==12,[0xe9,0xea,0xe2,0xcd,0xb0,0xb1,0xb7].contains(Int(usage)) else{return}
 emit(["type":"key","usage":usage,"down":IOHIDValueGetIntegerValue(value)>0])
},nil)
IOHIDManagerScheduleWithRunLoop(manager,CFRunLoopGetCurrent(),CFRunLoopMode.defaultMode.rawValue)
let opened=IOHIDManagerOpen(manager,IOOptionBits(kIOHIDOptionsTypeNone))
emit(["type":"ready","opened":opened==kIOReturnSuccess,"access":IOHIDCheckAccess(kIOHIDRequestTypeListenEvent).rawValue,"granted":IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)==kIOHIDAccessTypeGranted])
CFRunLoopRun()
