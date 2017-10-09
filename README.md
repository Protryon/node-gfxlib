# node-gfxlib
An image drawing and rasterizing library written for node.js.

## Install
Run `npm install gfxlib` inside of your node.js project.

## Usage

### Reading/Writing

```
const fs = require('fs');
const gl = require('gfxlib');
let buf = new gl.ImageBuffer('png', fs.readFileSync('myImage.png'));
fs.writeFileSync('myImageOut.jpg', buf.compress('jpg'));
```

### Creating New Images

#### Empty (black)

```
let buf = new gl.ImageBuffer(null, null, 1000, 2000); // creates a 1000x2000 image
```

#### Existing RGBA buffer

```
let buff = new gl.ImageBuffer(null, myBuffer, 1000, 2000);
```

### Creating Images from Images

```
let buf = ...
let myResizedImage = buf.resize(2000, 1000, gl.RESIZE_MODE.BILINEAR); // TRANSPARENTFILL and DIRECT are also available
let mySubimage = buf.subimage(30, 30, 50, 50); // gets a smaller image section out of a larger one, can also be used to clone images
```

### Drawing Shapes

```
let buf = ...

buf.drawImage(80, 80, 160, 160, myOtherImage, gl.RESIZE_MODE.DIRECT);
// the above draws myOtherImage from x 80->160 and y 80->160. resizing will be done as needed

buf.drawLine(30, 30, 50, 50, 4, new gl.Color(255, 0, 0, 255), new gl.Color(0, 255, 0, 255));
// the above draws a lines from (30, 30) to (50, 50) with a line width of 4 and a red->green gradient

buf.drawRect(30, 30, 50, 50, new gl.Color(255, 0, 0, 255), false, 3);
// the above draws a hollow red rectangle from (30, 30) to (50, 50) with a line width of 3
buf.drawRect(30, 30, 50, 50, new gl.Color(0, 0, 255, 255), true);
// the above draws a filled blue rectangle from (30, 30) to (50, 50) with a line width of 3

buf.drawCircle(40, 40, 10, new Color(0, 255, 0, 255), false, 3);
// the above draws a hollow green circle with a line width of 3 at (40, 40) with a radius of 10 pixels
buf.drawCircle(40, 40, 10, new Color(0, 255, 0, 255), true);
// the above draws a solid green circle at (40, 40) with a radius of 10 pixels

buf.drawPolygon([[30, 30], [50, 30], [40, 40]], new Color(255, 0, 0, 255), false, 3);
// the above draws a red hollow triangle with the given points
buf.drawPolygon([[30, 30], [50, 30], [40, 40]], new Color(255, 0, 0, 255), true);
// the above draws a red solid triangle with the given points
// for the above two, the points are sorted clockwise around the geometic center, so criss-crosses are not possible.

buf.drawPolygonUnsorted([[30, 30], [50, 30], [40, 40]], new Color(255, 0, 0, 255), 3);
// the above draws a hollow red triangle with the given points. the points are not sorted, and there is no filled variant

buf.fill(new Color(0, 255, 0, 255));
// the above fills the entire image with red.
```

### Drawing Text

#### Setting up Fonts

Fonts can be initialized via `Font.fromSystem` or `Font.fromFile`.

```
let font = gl.Font.fromSystem({family: 'Arial', style: 'Regular'}, mySize);
//or
let font = gl.Font.fromFile('/path/to/my/font.ttf', mySize);
```

#### Drawing Text

```
let buf = ...
buf.fill(new Color(255, 255, 255, 255)); // white out
let font = Font.fromSystem({family: 'Arial'}, 10); // create any Arial font of size 10

buf.drawStringLeft(10, 40, font, "test", new Color(255, 0, 0, 255));
// the above draws a string, "test", from the right with an Arial font
// there is also a drawStringRight to right-align
// if a character cannot completely fit in the image, it will not be drawn
```

## To Do
* Arcs
* Transformations: Rotation, Flipping, Filters
* Line Chains
* Ellipses
* Round-cornered Rectangles
* Auto-Clip
* GIF/SVG/Other Formats