{
  description = "Interactive Music Theory Demo";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f {
        pkgs = import nixpkgs { inherit system; };
      });
    in
    let
      serveScript = pkgs: pkgs.writeShellScriptBin "serve" ''
        PORT=''${1:-8000}
        exec ${pkgs.python3.interpreter} -c "
import livereload, sys
server = livereload.Server()
server.watch('*.html')
server.watch('*.css')
server.watch('*.js')
server.serve(port=$PORT, open_url_delay=1)
"
      '';
    in
    {
      devShells = forAllSystems ({ pkgs }: {
        default = pkgs.mkShell {
          packages = [
            pkgs.python3
            pkgs.python3Packages.livereload
            pkgs.bun
            (serveScript pkgs)
          ];
        };
      });
    };
}
