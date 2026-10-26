// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import Foundation
import ImageIO
import CoreGraphics
let args=CommandLine.arguments
guard args.count==3,let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:args[1]) as CFURL,nil) else{exit(2)}
let options:[CFString:Any]=[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:1280,kCGImageSourceCreateThumbnailWithTransform:true]
guard let thumbnail=CGImageSourceCreateThumbnailAtIndex(source,0,options as CFDictionary),let destination=CGImageDestinationCreateWithURL(URL(fileURLWithPath:args[2]) as CFURL,"public.jpeg" as CFString,1,nil) else{exit(3)}
CGImageDestinationAddImage(destination,thumbnail,[kCGImageDestinationLossyCompressionQuality:0.72] as CFDictionary)
if !CGImageDestinationFinalize(destination){exit(4)}
var pixels=[UInt8](repeating:0,count:64*36*4)
let blank=pixels.withUnsafeMutableBytes { buffer -> Bool in
 guard let context=CGContext(data:buffer.baseAddress,width:64,height:36,bitsPerComponent:8,bytesPerRow:64*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else{return false}
 context.draw(thumbnail,in:CGRect(x:0,y:0,width:64,height:36))
 let values=buffer.bindMemory(to:UInt8.self);var dark=0
 for i in stride(from:0,to:values.count,by:4){if values[i]<8 && values[i+1]<8 && values[i+2]<8{dark+=1}}
 return Double(dark)/Double(64*36)>0.999
}
print(blank ? "blank" : "ready")
