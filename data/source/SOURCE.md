# Library snapshot source (v1, SBD-2)

Copied byte-for-byte on 2026-10-16 from `kepz94/scribaltest2` at commit
`ad95be0aff20f3fadc897c9f71b4cb38a254e702` (2026-10-01, "A phone that runs out of storage no longer loses its marks silently").
Scribal is never read at runtime; refreshing this snapshot is a deliberate, versioned step.

| File | Source path | Bytes | sha256 | Git blob |
|---|---|---|---|---|
| `scriptures.json` | `scribaltest1-main/public/scriptures.json` | 15,815,077 | `d1be935d6a3f57574d703b206b43f6f892dc12bef358a88394a3ad71efab4501` | `ff7cb0829a78b8ea63acfa6b07fb740eb23a8654` |
| `webster1828.json` | `scribaltest1-main/public/webster1828.json` | 5,210,563 | `09b08d0ca03f30bc70d7b21bbddeb6a0c471779914b452a71683952286300e28` | `e14ea0f29d04aed3d7288a24cb353b22ec0e916b` |

`src/vendor/sermons.ts` is a verbatim copy of `scribaltest1-main/src/sermons.ts` at the same commit
(git blob `b9a9ad7e63e8c2c060351ad3eeac2db89aebc0bc`) below a provenance header.

Check: `sha256sum data/source/scriptures.json data/source/webster1828.json`
