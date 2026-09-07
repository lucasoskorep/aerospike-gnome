# Aerospike Gnome (Tiling Window Manager)

Aerospike is a simple and opinionated tiling window manager for gnome.

This project takes inspiration from previous gnome tiling window managers such
as [forge](https://github.com/forge-ext/forge)
and [cosmic-shell](https://github.com/pop-os/gnome-shell-extension-pop-cosmic) as well as
MacOS tiling WMs, mainly [Aerospace](https://github.com/nikitabobko/AeroSpace) (not affiliated).

## Current Features

- Auto-tiling
- Accordion layouts with variable sizes
- Tabbed layouts
- Tree-based (albeit set depth of 2 for now) container-window paired layout similar to Aerospace
- Diagram for this is pending

## Planned functionality

- Full Keyboard control w/window movement
- Sub-containers (more tree layers than the 1 supported for now)
- Gap size customization

## Not currently planned

- Active window borders
    - See my other extension for a rainbow or static border - [PrettyBorders](https://github.com//pretty-borders)
- complicated window dragging features and uis
    - Aerospace supports control + drag to combine windows while moving with the mouse, and normal window dragging.

## Installation

Aerospike isn't on the GNOME extension store yet, so install it from source.
This builds the extension locally and drops it into your user's extension dir.
Requires [just](https://github.com/casey/just) as the command runner.

Arch Linux:

```bash
sudo pacman -S git just
```

Clone and install:

```bash
git clone https://github.com/lucasoskorep/aerospike-gnome
cd aerospike-gnome
just install
```

After installing from source, enable it (toggle in the Extensions app, or):

```bash
gnome-extensions enable aerospike@lucaso.io
```

Re-login or restart the shell (`Alt+F2` → `r` on X11) to pick it up.

## Development

Building and debugging locally needs a few extra tools:

- `just` — the command runner
- `fnm` — fast node version manager (the build runs on Node via pnpm)
- `glib2` — provides `glib-compile-schemas` for compiling the settings schema

Arch Linux:

```bash
sudo pacman -S just fnm glib2
```

Set up the Node runtime with fnm (the pinned version lives in `.node-version`):

```bash
fnm install
fnm use
```

Then:

```bash
just install      # install deps + build + drop into the extension dir
just lint         # lint
just test         # run the test suite
just test-watch   # run tests in watch mode
just live-debug   # tail gnome-shell logs while you poke at it
```

