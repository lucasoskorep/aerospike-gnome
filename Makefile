NAME=aerospike
DOMAIN=lucaso.io

.PHONY: all pack install clean

all: dist/extension.js

node_modules: package.json
	pnpm install

dist/extension.js : node_modules
	tsc

schemas/gschemas.compiled: schemas/org.gnome.shell.extensions.$(NAME).gschema.xml
	glib-compile-schemas schemas

$(NAME).zip: dist/extension.js dist/prefs.js schemas/gschemas.compiled
	@rm -rf dist/*
	@cp metadata.json dist/
	@cp stylesheet.css dist/
	@mkdir dist/schemas
	@cp schemas/*.compiled dist/schemas/
	@(cd dist && zip ../$(NAME).zip -9r .)

pack: $(NAME).zip

install: $(NAME).zip

clean:
	@rm -rf dist node_modules $(NAME).zip

test:
	@dbus-run-session -- gnome-shell --nested --wayland

.PHONY: install-and-test
install-and-test: install test
