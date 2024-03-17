{ pkgs ? import ./pinned.nix }:

pkgs.buildEnv {
  name = "vt2-env";
  paths = [
    pkgs.nodejs_20
  ];
}
