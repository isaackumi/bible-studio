# Song packs

Song packs are collections the Songs window offers to install with one click
(Songs → "Song packs"). Nothing is installed unless the operator chooses it.

## Adding a pack

1. Put the songs in a `.zip` of OpenLyrics `.xml` files (Songs → Export makes
   one), and place it in this folder.
2. Add an entry to `index.json`:

```json
[
  {
    "id": "public-domain-hymns-v1",
    "name": "Public-domain hymns",
    "folder": "Hymns (public domain)",
    "file": "public-domain-hymns.zip",
    "description": "Classic hymns whose words are in the public domain.",
    "license": "Public domain"
  }
]
```

`id` must change when the pack's contents change, so churches can install the
new version.

## Only public-domain or licensed texts

Every song in a bundled pack must be safe to redistribute: public domain
(for the US, published before 1929, and check translations separately) or
under a license that allows redistribution. Record the source of each text.
Copyrighted worship songs come in through each church's own SongSelect
account, not through packs.
