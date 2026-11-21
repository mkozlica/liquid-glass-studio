/** LiquidGlass: an original, dependency-free WebGL2 material renderer. */
const vertex = `#version 300 es
in vec2 a_position;out vec2 v_uv;void main(){v_uv=a_position*.5+.5;gl_Position=vec4(a_position,0.,1.);}`;
const fragment = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 outColor;
uniform vec2 u_resolution,u_pointer,u_imageSize;
uniform float u_time,u_refraction,u_dispersion,u_frost,u_thickness,u_light;
uniform int u_shape,u_bg;uniform sampler2D u_mask,u_image;
float roundedBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.)+length(max(q,0.))-r;}
float textSDF(vec2 p,vec2 size){vec2 uv=p/size+.5;if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return .1+length(max(abs(p)-size*.5,0.));return (texture(u_mask,vec2(uv.x,1.-uv.y)).r-.5)*128.*min(size.x/1024.,size.y/256.);}
float scene(vec2 p){float a=u_resolution.x/u_resolution.y;vec2 move=u_pointer;
if(u_shape==1)return length(p-move)-.235;
if(u_shape==2)return roundedBox(p-move,vec2(min(.36*a,.48),.115),.115);
if(u_shape==3)return roundedBox(p-move,vec2(min(.34*a,.44),.245),.055);
if(u_shape==4)return textSDF(p-move,vec2(.88*a,.24));
float text=textSDF(p-vec2(-.02*a,.215),vec2(.88*a,.24));
float ball=length(p-vec2(.30*a,.015)-move)-.134;
float pill=roundedBox(p-vec2(-.02*a,-.24),vec2(.192*a,.064),.064);
float play=length(p-vec2(-.32*a,-.24))-.067;
return min(min(text,ball),min(pill,play));}
vec3 background(vec2 uv){
float a=u_resolution.x/u_resolution.y;
if(u_bg==3){vec2 ratio=vec2(a,1.)/vec2(u_imageSize.x/u_imageSize.y,1.);ratio/=max(ratio.x,ratio.y);return texture(u_image,(uv-.5)*ratio+.5).rgb;}
vec2 p=(uv-.5)*vec2(a,1.);
if(u_bg==2){float l=min(abs(fract(p.x*15.+.5)-.5),abs(fract(p.y*15.+.5)-.5));float grid=1.-smoothstep(.009,.027,l);vec3 col=mix(vec3(.86,.845,.80),vec3(.38,.40,.38),grid*.36);float black=1.-smoothstep(.002,.004,abs(length(p-vec2(-.14,.02))-.23));col=mix(col,vec3(.1,.12,.10),black*.7);return col;}
float z=p.y*.86-p.x*.53+u_time*.025;
float wave=sin(z*51.+.28*sin(p.x*3.+u_time*.18));
float bands=pow(.5+.5*wave,19.);float halo=pow(.5+.5*wave,3.);
float second=pow(.5+.5*sin(z*26.-.8),36.);
float flicker=.88+.12*sin(p.x*4.+p.y*2.+u_time*.23);
vec3 dark=u_bg==0?vec3(.075,.008,.002):vec3(.006,.016,.085);
vec3 glow=u_bg==0?vec3(.60,.065,.003):vec3(.035,.15,.57);
vec3 hot=u_bg==0?vec3(1.,.47,.21):vec3(.30,.67,1.);
vec3 c=dark+glow*halo*.38+hot*bands*1.32*flicker+glow*second*.7;
float vign=1.-.27*length(p);return c*max(.5,vign);}
vec3 frosted(vec2 uv,float blur){vec3 col=background(uv)*.20;for(int i=0;i<8;i++){float angle=float(i)*2.399963;float r=sqrt((float(i)+.5)/8.);vec2 off=vec2(cos(angle),sin(angle))*blur*r;col+=background(uv+off)*.1;}return col;}
void main(){vec2 aspect=vec2(u_resolution.x/u_resolution.y,1.);vec2 p=(v_uv-.5)*aspect;float d=scene(p);float aa=1.3/u_resolution.y;vec3 bg=background(v_uv);
float sd=scene(p-vec2(.009,-.017));float shadow=exp(-max(sd,0.)*55.)*.19*smoothstep(-.005,.02,d);bg*=1.-shadow;
if(d>aa){outColor=vec4(bg,1.);return;}
float e=.00065;vec2 grad=vec2(scene(p+vec2(e,0.))-scene(p-vec2(e,0.)),scene(p+vec2(0.,e))-scene(p-vec2(0.,e)));grad=normalize(grad+vec2(.0000001));
// One material profile for fixed and draggable shapes.
float bevel=mix(.008,.065,u_thickness);
float edge=clamp(1.+d/bevel,0.,1.);float slope=pow(edge,.62)*.96;vec3 N=normalize(vec3(grad*slope,sqrt(max(.04,1.-slope*slope))));
float bulge=max(0.,1.-edge)*.12;vec2 flow=vec2(sin(p.y*13.+u_time*.5),cos(p.x*11.+u_time*.4))*.001*u_thickness;
float travel=(.018+u_thickness*.12)*u_refraction;vec3 rayR=refract(vec3(0.,0.,-1.),N,1./(1.45+u_dispersion*.12));vec3 rayG=refract(vec3(0.,0.,-1.),N,1./1.45);vec3 rayB=refract(vec3(0.,0.,-1.),N,1./(1.45-u_dispersion*.12));
vec2 uvR=v_uv+rayR.xy*travel/aspect+flow,uvG=v_uv+rayG.xy*travel/aspect+flow,uvB=v_uv+rayB.xy*travel/aspect+flow;
float blur=u_frost*.027;vec3 glass=vec3(frosted(uvR,blur).r,frosted(uvG,blur).g,frosted(uvB,blur).b);
glass=mix(glass,vec3(.72,.76,.78),u_frost*.20);glass*=.97;
vec3 light=normalize(vec3(cos(u_light),sin(u_light),.85));vec3 halfV=normalize(light+vec3(0.,0.,1.));float spec=pow(max(dot(N,halfV),0.),75.)*.75;
float fresnel=.035+.65*pow(1.-N.z,4.);vec3 environment=mix(vec3(.08,.10,.13),vec3(.92,.85,.77),smoothstep(-.5,.85,dot(N,light)));
glass=mix(glass,environment,fresnel);glass+=spec*vec3(1.,.92,.83);
float rim=exp(-abs(d)*650.);float facing=dot(grad,normalize(light.xy));glass+=rim*(.05+.36*pow(max(facing,0.),3.))*vec3(1.,.87,.73);
float inner=exp(-abs(d+.006)*380.);glass+=inner*.075*vec3(.8,.85,1.);
// Subtle spectral rim remains localized to the glass edge.
float split=u_dispersion*pow(edge,8.)*.15;glass+=split*vec3(.6+.4*sin(facing*5.),.45+.4*sin(facing*5.+2.1),.6+.4*sin(facing*5.+4.2));
float cover=1.-smoothstep(-aa,aa,d);vec3 color=mix(bg,glass,cover);outColor=vec4(color,1.);}`;
export class LiquidGlass {
 constructor(canvas,options={}){
  this.canvas=canvas;this.options={refraction:.65,dispersion:.3,frost:.06,thickness:.55,light:135,shape:0,background:0,...options};this.pointer=[0,0];this.paused=matchMedia('(prefers-reduced-motion: reduce)').matches;this.time=0;this.lastTime=performance.now();this.destroyed=false;
  const gl=this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 is unavailable.');
  const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(this.program);
  this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(this.program,'a_position');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  this.uniforms={};for(const name of ['resolution','pointer','imageSize','time','refraction','dispersion','frost','thickness','light','shape','bg','mask','image'])this.uniforms[name]=gl.getUniformLocation(this.program,'u_'+name);
  this.mask=this.texture(0);this.image=this.texture(1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));this.imageSize=[1,1];this.setText('GLASS');
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();this.animate=this.animate.bind(this);this.frame=requestAnimationFrame(this.animate);
 }
 texture(unit){const gl=this.gl;const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
 setText(text){
  const w=1024,h=256,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 230px Arial, sans-serif';const content=String(text||'GLASS').slice(0,9).toUpperCase();const width=ctx.measureText(content).width;if(width>960)ctx.font=`900 ${230*960/width}px Arial, sans-serif`;ctx.fillText(content,w/2,h*.54);
  const pixels=ctx.getImageData(0,0,w,h).data;const n=w*h,inside=new Uint8Array(n);for(let i=0;i<n;i++)inside[i]=pixels[i*4+3]>127?1:0;
  const dist=new Float32Array(n);dist.fill(10000);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(inside[i]!==inside[i-1]||inside[i]!==inside[i+1]||inside[i]!==inside[i-w]||inside[i]!==inside[i+w])dist[i]=0;}
  for(let y=1;y<h;y++)for(let x=1;x<w-1;x++){const i=y*w+x;dist[i]=Math.min(dist[i],dist[i-1]+1,dist[i-w]+1,dist[i-w-1]+1.4142,dist[i-w+1]+1.4142);}
  for(let y=h-2;y>=0;y--)for(let x=w-2;x>0;x--){const i=y*w+x;dist[i]=Math.min(dist[i],dist[i+1]+1,dist[i+w]+1,dist[i+w+1]+1.4142,dist[i+w-1]+1.4142);}
  const data=new Uint8Array(n);for(let i=0;i<n;i++)data[i]=Math.round(Math.max(0,Math.min(255,127.5+(inside[i]?-1:1)*dist[i]*255/128)));
  const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,w,h,0,gl.RED,gl.UNSIGNED_BYTE,data);this.text=content;
 }
 setOptions(options){Object.assign(this.options,options);return this;}
 setPointer(x,y){this.pointer=[x,y];return this;}
 setBackground(source){const gl=this.gl;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.image);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);this.imageSize=[source.naturalWidth||source.videoWidth||source.width,source.naturalHeight||source.videoHeight||source.height];this.options.background=3;return this;}
 resize(){const dpr=Math.min(devicePixelRatio||1,1.7),r=this.canvas.getBoundingClientRect();this.canvas.width=Math.max(1,Math.round(r.width*dpr));this.canvas.height=Math.max(1,Math.round(r.height*dpr));this.gl.viewport(0,0,this.canvas.width,this.canvas.height);}
 animate(now){if(this.destroyed)return;if(!this.paused&&!document.hidden)this.time+=Math.min((now-this.lastTime)/1000,.05);this.lastTime=now;if(!document.hidden)this.render();this.frame=requestAnimationFrame(this.animate);}
 render(){const gl=this.gl,o=this.options,u=this.uniforms;gl.useProgram(this.program);gl.uniform2f(u.resolution,this.canvas.width,this.canvas.height);gl.uniform2f(u.pointer,...this.pointer);gl.uniform2f(u.imageSize,...this.imageSize);gl.uniform1f(u.time,this.time);for(const key of ['refraction','dispersion','frost','thickness'])gl.uniform1f(u[key],o[key]);gl.uniform1f(u.light,o.light*Math.PI/180);gl.uniform1i(u.shape,o.shape);gl.uniform1i(u.bg,o.background);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.image);gl.uniform1i(u.mask,0);gl.uniform1i(u.image,1);gl.drawArrays(gl.TRIANGLES,0,6);}
 destroy(){this.destroyed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();const g=this.gl;g.deleteTexture(this.mask);g.deleteTexture(this.image);g.deleteBuffer(this.buffer);g.deleteProgram(this.program);}
}
