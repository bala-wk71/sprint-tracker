# Mascot art

GIFs shown by the dashboard visit greeter. The pools live in
`lib/mascotArt.ts` — the overlay picks one at random from the matching mood
each time it appears, so multiple files rotate naturally:

- `happy-*.gif` — XP gains and won wagers (currently Chopper celebrating)
- `sad-*.gif` — XP losses and lost wagers (currently Luffy crying)

To add art: drop a GIF in this folder and add its filename to the right pool
in `lib/mascotArt.ts`. Roughly square images look best; they render at 96×96.
If a pool is empty or a file fails to load, a built-in SVG mascot fills in.
