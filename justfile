set dotenv-load
NAME:="aerospike"
DOMAIN:="lucaso.io"
FULL_NAME:=NAME + "@" + DOMAIN

packages:
	pnpm install

build: packages && build-schemas
    rm -rf dist/*
    tsc
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
	rm -rf /.local/share/gnome-shell/extensions/{{NAME}}@{{DOMAIN}}/*
	cp -r dist/* ~/.local/share/gnome-shell/extensions/{{NAME}}@{{DOMAIN}}/

run:
    env MUTTER_DEBUG_DUMMY_MODE_SPECS=1280x720 dbus-run-session -- gnome-shell --nested --wayland

install-and-run: install run

#pack: build
#    gnome-extensions pack dist \
#        --force \
#        --out-dir . \
#        --schema ../schemas/org.gnome.shell.extensions.aerospike.gschema.xml
#
#install-pack: pack
#    gnome-extensions install ./{{FULL_NAME}}.shell-extension.zip --force