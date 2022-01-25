#!/usr/bin/env nix-shell
#!nix-shell install.nix --run install-systemd-unit

{ pkgs ? import <nixpkgs> { }
, user ? "justin"
, dir ? "/home/${user}/Code/vt2"
}:
let
  home = "/home/${user}";
  source = ''. ${home}/.bashrc'';
  cmd = ''cd ${dir} && node .'';

  sdunit = pkgs.writeTextFile {
    name = "vt2";
    destination = "/vt2.service";
    text = ''
      [Unit]
      Description=vt2 - vid tracker 2

      [Service]
      Type=simple
      ExecStart=/bin/bash -c "${source} && ${cmd}"

      [Install]
      WantedBy=default.target
    '';
  };

  install-systemd-unit = pkgs.writeShellScriptBin "install-systemd-unit" ''
    #!/usr/bin/env nix-shell
    #!nix-shell -i bash

    service="vt2.service"
    systemctl --user disable --now $service | echo "$service is already disabled"
    systemctl --user enable --now "${sdunit}/$service"
    systemctl --user daemon-reload
    systemctl --user reset-failed
  '';

in
pkgs.mkShell {
  buildInputs = [
    install-systemd-unit
  ];
}
