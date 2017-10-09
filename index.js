const fs = require('fs');
const PNG = require('pngjs').PNG;
const jpeg = require('jpeg-js');
const ft = require('freetype2');
const fm = require('font-manager');

let RESIZE_MODE = {
	TRANSPARENTFILL: 0,
	SCALE_DIRECT: 1,
	SCALE_BILINEAR: 2,
}

class Font {
	constructor(face, size) {
		this.face = face;
		this.size = size;
		ft.Set_Char_Size(face, 0, size * 64, 300, 300);
	}

	static fromFile(file, size) {
		let ttf = fs.readFileSync(file);
		let face = {};
		let err = ft.New_Memory_Face(ttf, 0, face);
		if(err) return null;
		return new Font(face.face, size);
	}

	static fromSystem(descriptor, size) {
		let fonts = fm.findFontsSync(descriptor);
		if(fonts.length < 0) return null;
		return Font.fromFile(fonts[0].path, size);
	}

	updateSize(size) {
		this.size = size;
		ft.Set_Char_Size(this.face, 0, size * 64, 300, 300);
	}

	getChar(c, color) {
		let i = ft.Get_Char_Index(this.face, typeof c == 'number' ? c : c.charCodeAt(0));
		let err = ft.Load_Glyph(this.face, i, 0) // FT_LOAD_DEFAULT
		if(err) return null;
		err = ft.Render_Glyph(this.face.glyph, 0) // FT_RENDER_MODE_NORMAL
		if(err) return null;
		let ndata = Buffer.alloc(4 * this.face.glyph.bitmap.width * this.face.glyph.bitmap.rows);
		for(let y = 0; y < this.face.glyph.bitmap.rows; y++) {
			for(let x = 0; x < this.face.glyph.bitmap.width; x++) {
				ndata.writeUInt32LE(color.scale(new Color(0, 0, 0, 0), (this.face.glyph.bitmap.buffer[y * this.face.glyph.bitmap.width + x]) / 255).toInt(), y * this.face.glyph.bitmap.width * 4 + x * 4);
			}
		}
		return {width: this.face.glyph.bitmap.width, horiAdvance: this.face.glyph.metrics.horiAdvance / 64, height: this.face.glyph.bitmap.rows, data: ndata};
	}

	drawStringLeft(img, x, y, str, color) {
		let maxHeight = 0;
		for(let i = 0; i < str.length; i++) {
			let c = this.getChar(str[i], color);
			img.drawImage(x, y - c.height, x + c.width, y, new ImageBuffer(null, c.data, c.width, c.height), RESIZE_MODE.TRANSPARENTFILL);
			x += c.horiAdvance;
			if(c.height > maxHeight) maxHeight = c.height;
		}
		return maxHeight;
	}

	drawStringRight(img, x, y, str, color) {
		let maxHeight = 0;
		for(let i = str.length - 1; i >= 0; i--) {
			let c = this.getChar(str[i], color);
			x -= c.horiAdvance;
			img.drawImage(x, y - c.height, x + c.width, y, new ImageBuffer(null, c.data, c.width, c.height), RESIZE_MODE.TRANSPARENTFILL);
			if(c.height > maxHeight) maxHeight = c.height;
		}
		return maxHeight;
	}
}

class Color {
	constructor(r, g, b, a) {
		this.r = r | 0;
		this.g = g | 0;
		this.b = b | 0;
		this.a = a | 0;
	}

	static fromInt(i) {
		return new Color((i >> 24) & 0xFF, (i >> 16) & 0xFF, (i >> 8) & 0xFF, i & 0xFF);
	}

	toInt() {
		let b = Buffer.alloc(4);
		b.writeUInt8(this.r & 0xFF, 0);
		b.writeUInt8(this.g & 0xFF, 1);
		b.writeUInt8(this.b & 0xFF, 2);
		b.writeUInt8(this.a & 0xFF, 3);
		return b.readUInt32LE(0);
	}

	scale(otherColor, scale) {
		return new Color(this.r * scale + otherColor.r * (1 - scale), this.g * scale + otherColor.g * (1 - scale), this.b * scale + otherColor.b * (1 - scale), this.a * scale + otherColor.a * (1 - scale));
	}
}

class ImageBuffer extends Buffer {
	constructor(format, buf, width, height) {
		if(format == 'png') {
			let dec = PNG.sync.read(buf);
			super(dec.data);
			this.__proto__ = ImageBuffer.prototype;
			this.width = dec.width;
			this.height = dec.height;
		}else if (format == 'jpg' || format == 'jpeg') {
			let dec = jpeg.decode(buf);
			super(dec.data);
			this.__proto__ = ImageBuffer.prototype;
			this.width = dec.width;
			this.height = dec.height;
		}else {
			super(buf == null ? Buffer.alloc(width * 4 * height) : buf);
			this.__proto__ = ImageBuffer.prototype;
			this.width = width;
			this.height = height;
		}
	}

	compress(format) {
		if(format == 'png') {
			return PNG.sync.write({data: this, width: this.width, height: this.height});
		}else if(format == 'jpg' || format == 'jpeg') {
			return jpeg.encode({data: this, width: this.width, height: this.height}, 50).data;
		}
	}

	getPixel(x, y) {
		if(x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
		let i = this.readUInt32LE(y * this.width * 4 + x * 4);
		return Color.fromInt(i);
	}

	setPixel(x, y, color) {
		if(color.a < 255) {
			color = color.scale(this.getPixel(x, y), color.a / 255.);
		}
		if(x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
		this.writeUInt32LE(color.toInt(), y * this.width * 4 + x * 4);
	}

	resize(width, height, mode) {
		let newBuf = Buffer.alloc(width * 4 * height);
		if(mode == RESIZE_MODE.TRANSPARENTFILL) {
			for(let y = 0; y < Math.min(this.height, height); y++) {
				this.copy(newBuf, y * width * 4, y * this.width * 4, y * this.width * 4 + Math.min(this.width, width) * 4);
			}
		}else if(mode == RESIZE_MODE.SCALE_DIRECT || mode == RESIZE_MODE.SCALE_BILINEAR) {
			let ar = this.width / this.height;
			let rw = width;
			let rh = height;
			if(rw > rh * ar) {
				rw = rh * ar;
			}
			if(rh > rw / ar) {
				rh = rw / ar;
			}
			if(mode == RESIZE_MODE.SCALE_DIRECT) {
				for(let y = 0; y < height; y++) {
					let sy = (y / height * this.height) | 0;
					for(let x = 0; x < width; x++) {
						let sx = (x / width * this.width) | 0;
						newBuf.writeUInt32LE(this.readUInt32LE(sy * this.width * 4 + sx * 4), y * width * 4 + x * 4);
					}
				}
			}else {
				for(let y = 0; y < height; y++) {
					let sy = (y / height * this.height);
					for(let x = 0; x < width; x++) {
						let sx = (x / width * this.width);
						let r = 0;
						let g = 0;
						let b = 0;
						let a = 0;
						let pc = 0;
						for(let sxi = (sx | 0) - 1; sxi <= (sx | 0) + 1; sxi++) {
							for(let syi = (sy | 0) - 1; syi <= (sy | 0) + 1; syi++) {
								let p = this.getPixel(sxi, syi);
								if(p == null) continue;
								let fac = Math.sqrt((sx - (sxi + .5)) * (sx - (sxi + .5)) + (sy - (syi + .5)) * (sy - (syi + .5))) / 4;
								fac = fac == 0 ? 1 : 1 / fac;
								r += p.r * fac;
								g += p.g * fac;
								b += p.b * fac;
								a += p.a * fac;
								pc += fac;
							}
						}
						r /= pc;
						g /= pc;
						b /= pc;
						a /= pc;
						newBuf.writeUInt32BE(new Color(r, g, b, a).toInt(), y * width * 4 + x * 4);
					}
				}
			}
		}
		return new ImageBuffer(null, newBuf, width, height)
	}

	subimage(x1, y1, x2, y2) {
		if(x1 < 0 || y1 < 0 || x2 >= this.width || y2 >= this.height || x1 >= x2 || y1 >= y2) return null;
		let img = new ImageBuffer(null, null, x2 - x1, y2 - y1);
		for(let y = y1; y < y2; y++) {
			this.copy(img, (y - y1) * (x2 - x1) * 4, y * this.width * 4 + x1 * 4, y * this.width * 4 + x2 * 4)
		}
		return img;
	}

	drawImage(x1, y1, x2, y2, img, mode) {
		if(x1 < 0 || y1 < 0 || x2 >= this.width || y2 >= this.height || x1 >= x2 || y1 >= y2) return null;
		if(img.width != x2 - x1 || img.height != y2 - y1) {
			img = img.resize(x2 - x1, y2 - y1, mode);
		}
		for(let y = y1; y < y2; y++) {
			for(let x = x1; x < x2; x++) {
				this.setPixel(x, y, img.getPixel(x - x1, y - y1));
			}
		}
	}

	drawLine(x1, y1, x2, y2, width, color1, color2) {
		if(color2 == null) color2 = color1;
		if(x1 < 0) x1 = 0;
		if(x2 < 0) x2 = 0;
		if(x1 >= this.width) x1 = this.width - 1;
		if(x2 >= this.width) x2 = this.width - 1;
		if(y1 < 0) y1 = 0;
		if(y2 < 0) y2 = 0;
		if(y1 >= this.height) y1 = this.height - 1;
		if(y2 >= this.height) y2 = this.height - 1;
		if(x2 < x1) {
			let x3 = x2;
			x2 = x1;
			x1 = x3;
		}
		if(y2 < y1) {
			let y3 = y2;
			y2 = y1;
			y1 = y3;
		}
		let a = Math.atan2((y2 - y1), (x2 - x1));
		let dx = Math.cos(a);
		let dy = Math.sin(a);
		a += Math.PI / 2.;
		let sdx = Math.cos(a) / 2;
		let sdy = Math.sin(a) / 2;
		width *= 2;
		let d = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
		let x = x1;
		let y = y1;
		while(x <= x2 && y <= y2) {
			let prog = Math.sqrt((x1 - x) * (x1 - x) + (y1 - y) * (y1 - y)) / d;
			let color = color1.scale(color2, prog);
			this.setPixel(x | 0, y | 0, color);
			if(width > 0) {
				let sx = x;
				let sy = y;
				for(let i = 0; i < width; i++) {
					this.setPixel(sx | 0, sy | 0, color);
					let cx = sx;
					let cy = sy;
					while(cx == sx && cy == sy) { // near 45 degree angles can require sqrt 2 units of travel
						sx += sdx;
						sy += sdy;
					}
				}
				sx = x;
				sy = y;
				for(let i = 0; i < width; i++) {
					this.setPixel(sx | 0, sy | 0, color);
					let cx = sx;
					let cy = sy;
					while(cx == sx && cy == sy) { // near 45 degree angles can require sqrt 2 units of travel
						sx -= sdx;
						sy -= sdy;
					}
				}
			}
			let cx = x;
			let cy = y;
			while(cx == x && cy == y) { // near 45 degree angles can require sqrt 2 units of travel
				x += dx;
				y += dy;
			}
		}
	}

	drawRect(x1, y1, x2, y2, color, fill, lineWidth) {
		if(fill) {
			for(let x = x1; x < x2; x++) {
				for(let y = y1; y < y2; y++) {
					this.setPixel(x, y, color);
				}
			}
		}else{
			this.drawLine(x1, y1, x1, y2, lineWidth, color, color);
			this.drawLine(x1, y2, x2, y2, lineWidth, color, color);
			this.drawLine(x2, y2, x2, y1, lineWidth, color, color);
			this.drawLine(x2, y1, x1, y1, lineWidth, color, color);
		}
	}

	drawCircle(x, y, radius, color, fill, lineWidth) {
		let cir = 2 * Math.PI * radius;
		if(fill) {
			for(let cx = x - radius; cx <= x + radius; cx++) {
				for(let cy = y - radius; cy <= y + radius; cy++) {
					if(Math.sqrt((cx - x) * (cx - x) + (cy - y) * (cy - y)) <= radius) {
						this.setPixel(cx, cy, color);
					}
				}
			}
		}else {
			let lx = x + radius;
			let ly = y;
			for(let i = 1; i < Math.floor(cir) + 2; i++) {
				let cx = x + Math.cos((i / cir) * 2 * Math.PI) * radius;
				let cy = y + Math.sin((i / cir) * 2 * Math.PI) * radius;
				this.drawLine(lx, ly, cx, cy, lineWidth, color);
				lx = cx;
				ly = cy;
			}
		}
	}

	drawPolygon(points, color, fill, lineWidth) { // array of 2D arrays of points, they will be sorted so no order is needed
		if(points.length < 3) return;
		let ocx = 0;
		let ocy = 0;
		points.forEach(v => {
			ocx += v[0];
			ocy += v[1];
		});
		ocx /= points.length;
		ocy /= points.length;
		points = points.sort((a, b) => {
			return Math.atan2(a[1] - ocy, a[0] - ocx) < Math.atan2(b[1] - ocy, b[0] - ocx);
		});
		if(fill) {
			let colinear = function(p, q, r) {
				return q[0] <= Math.max(p[0], r[0]) && q[0] >= Math.min(p[0], r[0]) && q[1] <= Math.max(p[1], r[1]) && q[1] >= Math.min(p[1], r[1]);
			}
			let orient = function(p, q, r) {
				let v = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
				return v == 0 ? 0 : (v > 0 ? 1 : 2);
			}
			let intersects = function(p1, q1, p2, q2) {
				let o1 = orient(p1, q1, p2);
				let o2 = orient(p1, q1, q2);
				let o3 = orient(p2, q2, p1);
				let o4 = orient(p2, q2, q1);
				if(p2[0] == 30 && p2[1] == 30) console.log(o1, o2, o3, o4);
				if(o1 != o2 && o3 != o4) return true;
				if(o1 == 0 && colinear(p1, p2, q1)) return true;
				if(o2 == 0 && colinear(p1, q2, q1)) return true;
				if(o3 == 0 && colinear(p2, p1, q2)) return true;
				if(o4 == 0 && colinear(p2, q1, q2)) return true;
				return false;
			}
			let minx = points[0][0];
			let miny = points[0][1];
			let maxx = points[0][0];
			let maxy = points[0][1];
			for(let p of points) {
				if(p[0] < minx) minx = p[0];
				if(p[1] < miny) miny = p[1];
				if(p[0] > maxx) maxx = p[0];
				if(p[1] > maxy) maxy = p[1];
			}
			for(let y = miny; y <= maxy; y++) {
				let ex = [this.width, y];
				for(let x = minx; x <= maxx; x++) {
					let ins = 0;
					let i = 0;
					let ci = false;
					do {
						let n = (i + 1) % points.length;
						if(intersects(points[i], points[n], [x + .0001, y + .0001], ex)) { // offsets prevent line endpoint confusion mostly
							if(orient(points[i], [x, y], points[n]) == 0) {
								ins = colinear(points[i], [x, y], points[n]) ? 1 : 0;
								break;
							}
							ins++;
						}
						i = n;
					}while(i != 0);
					if(ins % 2 == 1) {
						this.setPixel(x, y, color);
					}
				}
			}
		}else{
			this.drawPolygonUnsorted(points, lineWidth, color);
		}
	}

	drawPolygonUnsorted(points, color, lineWidth) { // array of 2D arrays of points
		if(points.length < 3) return;
		for(let i = 0; i < points.length; i++) {
			let pi = (i + 1) % points.length;
			this.drawLine(points[i][0], points[i][1], points[pi][0], points[pi][1], lineWidth, color, color);
		}
	}

	fill(color) {
		this.drawRect(0, 0, this.width, this.height, color, true, 0);
	}

	drawStringLeft(x, y, font, str, color) {
		let strs = str.split('\n');
		let yo = 0;
		for(let i = 0; i < strs.length; i++) {
			yo += font.drawStringLeft(this, x, y + yo, strs[i], color) + font.size / 2;
		}
	}

	drawStringRight(x, y, font, str, color) {
		let strs = str.split('\n');
		let yo = 0;
		for(let i = 0; i < strs.length; i++) {
			yo += font.drawStringRight(this, x, y + yo, strs[i], color) + font.size / 2;
		}
	}
}

module.exports.RESIZE_MODE = RESIZE_MODE;
module.exports.Font = Font;
module.exports.Color = Color;
module.exports.ImageBuffer = ImageBuffer;

let b = new ImageBuffer(null, null, 100, 100);
b.fill(new Color(255, 255, 255, 255));
let f = Font.fromSystem({family: 'Arial'}, 10);
b.drawStringLeft(10, 40, f, "test\ntest", new Color(255, 0, 0, 255));
fs.writeFileSync('testout.jpg', b.compress('jpg'));