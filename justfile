set dotenv-load
NAME:="aerospike"
DOMAIN:="lucaso.io"
FULL_NAME:=NAME + "@" + DOMAIN

packages:
	pnpm install

build: packages && build-schemas
    rm -rf dist/*
    pnpm run build
    cp metadata.json dist/
    cp stylesheet.css dist/
    mkdir -p dist/schemas

build-schemas:
    glib-compile-schemas schemas
    cp schemas/org.gnome.shell.extensions.aerospike.gschema.xml dist/schemas/
    cp schemas/gschemas.compiled dist/schemas/

build-package: build
	cd dist && zip ../{{NAME}}.zip -9r .


install: build
	mkdir -p ~/.local/share/gnome-shell/extensions/{{NAME}}@{{DOMAIN}}
	rm -rf ~/.local/share/gnome-shell/extensions/{{NAME}}@{{DOMAIN}}/*
	cp -r dist/* ~/.local/share/gnome-shell/extensions/{{NAME}}@{{DOMAIN}}/

run:
    env MUTTER_DEBUG_DUMMY_MODE_SPECS=1280x720 dbus-run-session -- gnome-shell --devkit --wayland

install-and-run: install run

live-debug:
    journalctl /usr/bin/gnome-shell -f -o cat | tee debug.log

test:
    pnpm test

test-watch:
    pnpm test:watch

test-coverage:
    pnpm test:coverage

ci-local:
    act -W .gitea/workflows/build.yaml

lint:
    pnpm run lint

clean:
    pnpm run clean

#pack: build
#    gnome-extensions pack dist \
#        --force \
#        --out-dir . \
#        --schema ../schemas/org.gnome.shell.extensions.aerospike.gschema.xml
#
#install-pack: pack
#    gnome-extensions install ./{{FULL_NAME}}.shell-extension.zip --force