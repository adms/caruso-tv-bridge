// Copyright (c) 2026 Adms Chung; SPDX-License-Identifier: Apache-2.0
export class SpectrumFFT {
 constructor(size=4096,bands=72){if(size<32||(size&(size-1)))throw Error('FFT size must be a power of two');this.size=size;this.bands=bands;this.real=new Float64Array(size);this.imag=new Float64Array(size);this.window=Float64Array.from({length:size},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(size-1)));}
 analyse(samples,sampleRate){const n=this.size,r=this.real,im=this.imag;r.fill(0);im.fill(0);for(let i=0;i<Math.min(n,samples.length);i++)r[i]=(Number.isFinite(samples[i])?samples[i]:0)*this.window[i];for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[r[i],r[j]]=[r[j],r[i]];}
  for(let length=2;length<=n;length<<=1){const angle=-2*Math.PI/length,wr0=Math.cos(angle),wi0=Math.sin(angle);for(let i=0;i<n;i+=length){let wr=1,wi=0;for(let j=0;j<length/2;j++){const a=i+j,b=a+length/2,tr=wr*r[b]-wi*im[b],ti=wr*im[b]+wi*r[b];r[b]=r[a]-tr;im[b]=im[a]-ti;r[a]+=tr;im[a]+=ti;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;}}}
  const lo=40,hi=Math.min(16000,sampleRate/2),values=new Float32Array(this.bands);for(let i=0;i<this.bands;i++){const from=Math.max(1,Math.floor(lo*(hi/lo)**(i/this.bands)*n/sampleRate)),to=Math.max(from+1,Math.ceil(lo*(hi/lo)**((i+1)/this.bands)*n/sampleRate));let peak=0;for(let bin=from;bin<Math.min(to,n/2);bin++)peak=Math.max(peak,Math.hypot(r[bin],im[bin])*4/n);const db=20*Math.log10(Math.max(peak,1e-12));values[i]=Math.max(0,Math.min(1,(db+80)/68));}return values;
 }
}
export function mediaKey(media){const t=media?.track;return t?.title?JSON.stringify([media.appId||media.app||'',t.title,t.artist||'',t.album||'',t.duration||0]):null;}
export function playhead(media,now=Date.now()){if(!media?.track)return 0;const age=now-Date.parse(media.observedAt);return Math.max(0,media.track.position/1000+(media.deviceState==='Playing'&&age>=0&&age<15000?Math.min(age/1000,3):0));}
export function matchingDuration(audioSeconds,media){return Number.isFinite(audioSeconds)&&media?.track?.duration>0&&Math.abs(audioSeconds-media.track.duration/1000)<=2;}
