# Mascot art

The dashboard visit greeter looks for two images in this folder:

- `happy.gif` — shown for XP gains and won wagers
- `sad.gif` — shown for XP losses and lost wagers

PNG/WebP work too if named `happy.gif`/`sad.gif` is kept (the extension is
what the component requests), but simplest is to save actual GIFs. Roughly
square images around 200–400px look best; they render at 96×96.

Drop in whatever character you like (Luffy, Asta, …). Until both files exist
the app falls back to the built-in signal-blob mascot.
