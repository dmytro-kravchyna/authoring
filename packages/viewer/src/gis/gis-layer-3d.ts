import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
// @ts-ignore
import { TilesRenderer } from "3d-tiles-renderer";
import {
  TilesFadePlugin,
  TileCompressionPlugin,
  GLTFExtensionsPlugin,
  CesiumIonAuthPlugin,
  ReorientationPlugin,
  // @ts-ignore
} from "3d-tiles-renderer/plugins";
import { Ion } from "cesium";

Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1ZTVlZDM5OS05NTA0LTQ5MWYtYTAxZi0xNGQ0ZjEzMDZmN2QiLCJpZCI6NDEwNDcxLCJpYXQiOjE3NzQ3MTMwNTN9.pQsXAADthu0GYwsybHoig4-L-nrTcS6nb7x_Xg4Ebxw";

export class GisLayer3d {
  latitude = 40.701583010873364;
  longitude = -73.99434066200764;
  rotation = 0;

  private _reorientationPlugin?: ReorientationPlugin;
  private _tilesRenderer?: TilesRenderer;
  private _enabled = false;
  private _resolutionSet = false;
  private _updateInterval: ReturnType<typeof setInterval> | null = null;
  private _initialized = false;

  private _scene: THREE.Scene;
  private _camera: THREE.PerspectiveCamera;
  private _renderer: THREE.WebGLRenderer;

  get enabled() {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
    if (!this._initialized) return;
    if (value) {
      this._scene.add(this._tilesRenderer!.group);
      this.updateTiles();
    } else {
      this._scene.remove(this._tilesRenderer!.group);
    }
  }

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGLRenderer,
  ) {
    this._scene = scene;
    this._camera = camera;
    this._renderer = renderer;

    this._updateInterval = setInterval(() => {
      this.updateTiles();
    }, 300);
  }

  dispose() {
    if (this._updateInterval) {
      clearInterval(this._updateInterval);
    }
    if (this._tilesRenderer) {
      this._tilesRenderer.dispose();
    }
  }

  updateMapPosition() {
    this._reorientationPlugin!.transformLatLonHeightToOrigin(
      this.latitude * THREE.MathUtils.DEG2RAD,
      this.longitude * THREE.MathUtils.DEG2RAD,
      undefined,
      this.rotation,
    );
    this.updateTiles();
  }

  updateTiles() {
    if (!this._enabled || !this._initialized) return;
    if (!this._resolutionSet) {
      this._tilesRenderer!.setResolutionFromRenderer(this._camera, this._renderer);
      this._resolutionSet = true;
    }
    this._tilesRenderer!.update();
  }

  init(assetId = "2275207") {
    if (this._tilesRenderer) {
      this._tilesRenderer.dispose();
    }

    this._tilesRenderer = new TilesRenderer();

    const cesiumIonPlugin = new CesiumIonAuthPlugin({
      apiToken: Ion.defaultAccessToken,
      assetId,
      autoRefreshToken: true,
    });

    this._tilesRenderer.registerPlugin(cesiumIonPlugin);
    this._tilesRenderer.registerPlugin(new TileCompressionPlugin());
    this._tilesRenderer.registerPlugin(new TilesFadePlugin());

    this._reorientationPlugin = new ReorientationPlugin({
      lat: this.latitude * THREE.MathUtils.DEG2RAD,
      lon: this.longitude * THREE.MathUtils.DEG2RAD,
      recenter: true,
    });

    this._tilesRenderer.registerPlugin(this._reorientationPlugin);

    this._tilesRenderer.registerPlugin(
      new GLTFExtensionsPlugin({
        dracoLoader: new DRACOLoader().setDecoderPath("/resources/draco/gltf/"),
      }),
    );

    this._tilesRenderer.setCamera(this._camera);
    this._tilesRenderer.setResolutionFromRenderer(this._camera, this._renderer);

    this._tilesRenderer.addEventListener("load-tile-set", () => {
      const sphere = new THREE.Sphere();
      this._tilesRenderer!.getBoundingSphere(sphere);
      this._camera.updateProjectionMatrix();
    });

    if (this._enabled) {
      this._scene.add(this._tilesRenderer.group);
    }

    this._initialized = true;
  }
}
