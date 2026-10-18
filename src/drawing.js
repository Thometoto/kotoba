// Normalized vector strokes survive redraws and orientation changes, but are never uploaded.
export function mountDrawing(canvas,strokes,{readonly=false,onChange=()=>{}}={}){
 const ctx=canvas.getContext('2d');let active=null;let pointer=null;
 const point=e=>{const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 function paint(){
  const r=canvas.getBoundingClientRect();if(!r.width)return;
  const dpr=window.devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,r.width,r.height);ctx.strokeStyle='#183b30';ctx.fillStyle='#183b30';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
  for(const stroke of strokes){if(!stroke.length)continue;ctx.beginPath();ctx.moveTo(stroke[0].x*r.width,stroke[0].y*r.height);for(const p of stroke.slice(1))ctx.lineTo(p.x*r.width,p.y*r.height);ctx.stroke();if(stroke.length===1){ctx.beginPath();ctx.arc(stroke[0].x*r.width,stroke[0].y*r.height,2,0,2*Math.PI);ctx.fill();}}
 }
 canvas.onpointerdown=e=>{if(readonly||pointer!==null||e.button>0)return;e.preventDefault();pointer=e.pointerId;canvas.setPointerCapture(pointer);active=[point(e)];strokes.push(active);paint();onChange();};
 canvas.onpointermove=e=>{if(e.pointerId!==pointer||!active)return;e.preventDefault();active.push(point(e));paint();};
 const end=e=>{if(e.pointerId!==pointer)return;active=null;pointer=null;onChange();};
 canvas.onpointerup=end;canvas.onpointercancel=end;canvas.onlostpointercapture=end;
 const observer=new ResizeObserver(paint);observer.observe(canvas);paint();
 return {clear(){if(readonly)return;strokes.splice(0);paint();onChange();},undo(){if(readonly)return;strokes.pop();paint();onChange();},destroy(){observer.disconnect();canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=null;}};
}
