// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
import Foundation
import Vision
import ImageIO
let args=CommandLine.arguments
if args.count<2 {exit(2)}
guard let source=CGImageSourceCreateWithURL(URL(fileURLWithPath:args[1]) as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil) else {exit(3)}
let request=VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages=["zh-Hant","en-US"]
request.usesLanguageCorrection=false
request.customWords=["Netflix","Community","廢柴聯盟"]+Array(args.dropFirst(2))
do {
 try VNImageRequestHandler(cgImage:image).perform([request])
 var rows=(request.results ?? []).compactMap { item -> [String:Any]? in
  guard let candidate=item.topCandidates(1).first else {return nil}
  return ["text":candidate.string,"confidence":candidate.confidence,"x":item.boundingBox.minX,"y":item.boundingBox.minY,"width":item.boundingBox.width,"height":item.boundingBox.height]
 }
 let rectangles=VNDetectRectanglesRequest()
 rectangles.maximumObservations=32;rectangles.minimumConfidence=0.3;rectangles.minimumAspectRatio=0.1;rectangles.minimumSize=0.025;rectangles.quadratureTolerance=15
 try VNImageRequestHandler(cgImage:image).perform([rectangles])
 let w=image.width,h=image.height
 var pixels=[UInt8](repeating:0,count:w*h*4)
 let focusBoxes:[[String:Double]]=pixels.withUnsafeMutableBytes { buffer in
  guard let context=CGContext(data:buffer.baseAddress,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else{return []}
  context.draw(image,in:CGRect(x:0,y:0,width:w,height:h))
  let bytes=buffer.bindMemory(to:UInt8.self)
  func white(_ x:Int,_ y:Int)->Bool {if x<0 || x>=w || y<0 || y>=h{return false};let i=(y*w+x)*4;return bytes[i]>215 && bytes[i+1]>215 && bytes[i+2]>215}
  func near(_ x:Int,_ y:Int)->Bool {for d in -32...32 {if white(x+d,y) || white(x,y+d){return true}};return false}
  for i in rows.indices {
   let r=rows[i],x=r["x"] as! CGFloat,y=r["y"] as! CGFloat,rw=r["width"] as! CGFloat,rh=r["height"] as! CGFloat
   var light=0,count=0
   for a in 0...20 {for b in 0...6 {
    let px=Int((x+rw*Double(a)/20)*Double(w)),py=Int((1-y-rh*Double(b)/6)*Double(h))
    count+=1;if white(px,py){light+=1}
   }}
   rows[i]["lightBackground"]=Double(light)/Double(count)
  }
  return (rectangles.results ?? []).compactMap { observation in
   let b=observation.boundingBox
   if b.width<0.07 || b.height<0.025{return nil}
   let left=Int(b.minX*Double(w)),right=Int(b.maxX*Double(w)),top=Int((1-b.maxY)*Double(h)),bottom=Int((1-b.minY)*Double(h))
   var hit=0,total=0
   for j in 2...18 {let f=Double(j)/20;let x=left+Int(Double(right-left)*f),y=top+Int(Double(bottom-top)*f)
    for point in [(x,top),(x,bottom),(left,y),(right,y)] {total+=1;if near(point.0,point.1){hit+=1}}
   }
   let ratio=Double(hit)/Double(total)
   if ratio<0.70{return nil}
   return ["x":b.minX,"y":b.minY,"width":b.width,"height":b.height,"whiteBorder":ratio]
  }
 }
 let data=try JSONSerialization.data(withJSONObject:["width":image.width,"height":image.height,"rows":rows,"focusBoxes":focusBoxes],options:[.sortedKeys])
 FileHandle.standardOutput.write(data)
} catch {exit(4)}
