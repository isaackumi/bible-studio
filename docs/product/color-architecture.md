# Color architecture

Church Studio’s operator chrome follows PewBeam’s public palette: near-black, bone type, and signal orange. Projected scripture is a separate theme.

This note is taken from public product surfaces, not from decompiled code. PewBeam’s binary was not unpacked. PictorX’s marketing site was not copied.

## What the references actually use

PewBeam’s public site is near-black (`#050505`), bone (`#E4E4E4`), and a signal orange (`#FC4F00`), with warm paper (`#FFF4EF`) where scripture is discussed. Their own brand story is projection light on an open Bible. Inside the product, audience themes are separate from the operator chrome: Selah is gold on an image, Eden is green on a gradient, and lower thirds can be transparent. The interface itself has a light and a dark appearance. A color control shows a swatch, a hex value, and opacity on one row.

PictorX’s homepage is a generic multi-color web palette (blue, green, cyan, pink). That palette is not useful here. The useful idea is their design studio: a control is a named material, and each color does one job.

## Roles

Pigments live in `src/app.css` as `--pigment-*`. Components use roles. A role may point at a pigment. A component does not invent a new hex.

| Role | Job | Pigment |
| --- | --- | --- |
| `--booth` | Operator background | `#050505` |
| `--panel` | Docked panel | `#111010` |
| `--panel-2` | Raised control | `#1e1c1c` |
| `--line` | Hairline | `#312f2d` |
| `--ink` | Operator text | `#e4e4e4` |
| `--muted` | Labels, hints | `#918d8a` |
| `--paper` | Preview well | `#161414` |
| `--brass` / `--focus` / `--onair` | Selection and Take | signal `#fa4f00` |
| `--onair-deep` | Program well | `#1f0f0a` |
| `--pigment-presence` | Audience link is up | `#00ec66` |

The operator face is Instrument Sans. Titles use Instrument Serif. Projected text uses Inter, with Figtree loaded beside it. Those are the open families PewBeam publishes. Vend Sans and General Sans stay out of this repo. Appearance can swap the accent for Mustard, Ember, or Crimson.

Preview sits in a dark well. Program sits in a brown well with an orange frame, including in the light booth. Those two surfaces are how an operator tells staging from air without reading a label.

Audience themes (background, type color, lower third) stay presentation data. The default screen theme is black, bone Inter, and a mustard reference. A church can still project a green or gold look without repainting the booth.
