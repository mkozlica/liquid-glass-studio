# Liquid Glass Studio

An original, dependency-free implementation inspired by the public Agentic Liquid Glass demonstration at visionpictures.net. No commercial package code or assets are included.

## Run
Serve this folder over HTTP (`python3 -m http.server 8000`) and visit http://localhost:8000. ES modules require HTTP; opening index.html directly may be blocked by the browser.

## Reuse
Import `LiquidGlass` from `liquid-glass.js` and pass a canvas element with a nonzero CSS width and height:

```js
import { LiquidGlass } from './liquid-glass.js';
const glass = new LiquidGlass(document.querySelector('canvas'));
glass.setOptions({ refraction: .65, dispersion: .3, frost: .06,
  thickness: .55, light: 135, shape: 1, background: 0 });
glass.setText('HELLO');
glass.setPointer(0.1, 0);
// After the image has loaded:
// glass.setBackground(imageOrCanvas);
// glass.paused = true;
// When removing the component: glass.destroy();
```

Options: refraction, dispersion, frost: 0–1; thickness: .1–1; light: degrees; shape: 0 composition, 1 sphere, 2 pill, 3 card, 4 typography; background: 0 amber, 1 cobalt, 2 grid. `setBackground()` selects background 3. Pointer coordinates use canvas-height units, centered, with positive y upward. In composition mode the pointer moves the sphere; in individual modes it moves the entire shape. setText accepts up to nine characters.

## Rendering
The fragment shader evaluates signed distance fields for rounded shapes and a CPU-generated text distance texture. All shapes share the same thickness-controlled edge curvature and refraction profile, including the fixed controls and draggable sphere. Curved normals feed Snell refraction at three colour-dependent indices. A procedural light scene or uploaded image is sampled at displaced coordinates. Frost uses a fixed blur kernel; highlights, rim lighting and a Fresnel approximation complete the surface. This is a 2.5D material approximation, not a full volumetric ray tracer. The shape silhouettes remain planar; the surface normals simulate their curved depth.

The canvas refracts its own scene, not arbitrary live HTML behind it. To reproduce a webpage inside the glass, supply a rendered page image/canvas and update it as needed. Transparent video export and real-time DOM capture are not included. PNG export contains the canvas scene (HTML UI and pill label are separate).

WebGL2 is preferred. The studio automatically uses a Canvas2D software refraction renderer when WebGL2 is unavailable, then CSS only if both contexts are unavailable. The software renderer supports the same controls and caps rendering at 720 pixels per side and about 30 fps. No JavaScript dependencies. Google Fonts are optional and fall back to local sans-serif fonts. Uploaded images stay in the browser. Reduced-motion users start paused. Rendering pauses when the document is hidden; resolution is capped at 1.7× CSS pixels. Dispose the renderer with destroy() when no longer needed.


## Render deployment

Create a Static Site from this repository, branch `main`, build command `true`, publish directory `.`. No environment variables, server, database, or package installation is required.
