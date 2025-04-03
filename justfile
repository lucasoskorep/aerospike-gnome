set dotenv-load
NAME:="aerospike"
DOMAIN:="lucaso.io"

packages:
	pnpm install

build: packages
    rm -rf dist/*
    tsc
    glib-compile-schemas schemas
    cp metadata.json dist/
    cp stylesheet.css dist/
    mkdir dist/schemas
    cp schemas/*.compiled dist/schemas/


build-package: build
	cd dist && zip ../{{NAME}}.zip -9r .


install: build
	mkdir -p ~/.local/share/gnome-shell/extensions/{{NAME}}@{{DOMAIN}}
	rm -rf /.local/share/gnome-shell/extensions/{{NAME}}@{{DOMAIN}}/*
	cp -r dist/* ~/.local/share/gnome-shell/extensions/{{NAME}}@{{DOMAIN}}/

run:
    dbus-run-session -- gnome-shell --nested --wayland

install-and-run: install run