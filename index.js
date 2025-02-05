import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// import {renderer, camera, runtime, world, universe, physics, ui, rig, app, appManager, popovers} from 'app';
import Simplex from './simplex-noise.js';
import alea from './alea.js';
import metaversefile from 'metaversefile';
const {useFrame, useLocalPlayer, useLoaders, useUi, usePhysics, useCleanup} = metaversefile;


const {gltfLoader} = useLoaders();

const parcelSize = 16;
const width = 10;
const height = 10;
const depth = 10;
// const colorTargetSize = 64;
// const voxelSize = 0.1;
// const marchCubesTexSize = 2048;
// const fov = 90;
// const aspect = 1;
// const raycastNear = 0.1;
// const raycastFar = 100;
// const raycastDepth = 3;
// const walkSpeed = 0.0015;

const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localVector3 = new THREE.Vector3();
const localVector2D = new THREE.Vector2();
const localQuaternion = new THREE.Quaternion();
const localEuler = new THREE.Euler();
const localMatrix = new THREE.Matrix4();
const textureLoader = new THREE.TextureLoader();

function _makePromise() {
  let accept, reject;
  const p = new Promise((a, r) => {
    accept = a;
    reject = r;
  });
  p.accept = accept;
  p.reject = reject;
  return p;
}

export default () => {
  const physics = usePhysics();

  const object = new THREE.Object3D();
  const loadPromises = [];
  const physicsIds = [];
  /* const ambientLight = new THREE.AmbientLight(0xFFFFFF);
  rootScene.add(ambientLight);
  // rootScene.ambientLight = ambientLight;
  const directionalLight = new THREE.DirectionalLight(0xFFFFFF);
  directionalLight.position.set(1, 2, 3);
  rootScene.add(directionalLight);
  // rootScene.directionalLight = directionalLight; */

  class MultiSimplex {
    constructor(seed, octaves) {
      const simplexes = Array(octaves);
      for (let i = 0; i < octaves; i++) {
        simplexes[i] = new Simplex(seed + i);
      }
      this.simplexes = simplexes;
    }
    noise2D(x, z) {
      let result = 0;
      for (let i = 0; i < this.simplexes.length; i++) {
        const simplex = this.simplexes[i];
        result += simplex.noise2D(x * (2**i), z * (2**i));
      }
      // result /= this.simplexes.length;
      return result;
    }
  }

  const gridSimplex = new MultiSimplex('lol', 6);
  const gridSimplex2 = new MultiSimplex('lol2', 6);
  const terrainSimplex = new MultiSimplex('lol3', 6);

  const w = 4;
  const stacksBoundingBox = new THREE.Box2(
    new THREE.Vector2(5, 0),
    new THREE.Vector2(105, 100),
  );

  const parcelSpecs = [];
  const stacksMesh = (() => {
    const object = new THREE.Object3D();

    const w = 4;

    (async () => {
      const p = new Promise((accept, reject) => {
        gltfLoader.load(`https://webaverse.github.io/street-assets/fortnite.glb`, function(object) {
          object = object.scene;
          
          object.traverse(o => {
            if (o.isMesh) {
              o.material.color.setHex(0x111111);
            }
          });

          accept(object);
        }, function progress() {}, reject);
      });
      loadPromises.push(p);
      const fortniteMesh = await p;
      const floorMesh = fortniteMesh.getObjectByName('floor');
      const wallMesh = fortniteMesh.getObjectByName('wall');
      const rampMesh = fortniteMesh.getObjectByName('ramp');
      
      const position = new THREE.Vector3();
      // const quaternion = new THREE.Quaternion();
      const rng = alea('lol');

      // const s = 0.95;
      const floorGeometry = floorMesh.geometry.clone();
      const wallGeometry = wallMesh.geometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeScale(1, 4/3, 1));
      const rampGeometry = rampMesh.geometry.clone()
        .applyMatrix4(new THREE.Matrix4().makeScale(1, 4/3, 1));

      const geometries = [];
      const _mergeGeometry = (g, physicsSpec) => {
        geometries.push(g);

        if (physicsSpec) {
          const {position, quaternion, scale} = physicsSpec;
          const physicsId = physics.addBoxGeometry(position, quaternion, scale, false);
          physicsIds.push(physicsId);
        }
      };
      const _getKey = p => p.toArray().join(':');

      const numBuildings = 10;
      const seenBuildings = {};
      for (let i = 0; i < numBuildings; i++) {
        let buildingSize, buildingPosition;
        for (;;) {
          buildingSize = new THREE.Vector3(
            1 + Math.floor(rng() * 5),
            1 + Math.floor(rng() * 10),
            1 + Math.floor(rng() * 5),
          );
          buildingPosition = new THREE.Vector3(
            Math.floor(-20 + rng() * 40),
            0,
            Math.floor(-20 + rng() * 40),
          );
          if (buildingPosition.x <= -1 && buildingPosition.x + buildingSize.x > -1) {
            buildingPosition.x = -buildingSize.x - 1;
          } else if (buildingPosition.x < 2) {
            buildingPosition.x = 2;
          }

          const _fits = () => {
            for (let dx = 0; dx < buildingSize.x; dx++) {
              for (let dy = 0; dy < buildingSize.y; dy++) {
                for (let dz = 0; dz < buildingSize.z; dz++) {
                  const ax = buildingPosition.x + dx;
                  const ay = buildingPosition.y + dy;
                  const az = buildingPosition.z + dz;
                  const k = _getKey(new THREE.Vector3(ax, ay, az).multiplyScalar(w));
                  if (!seenBuildings[k]) {
                    // nothing
                  } else {
                    return false;
                  }
                }
              }
            }
            return true;
          };
          const _mark = () => {
            for (let dx = 0; dx < buildingSize.x; dx++) {
              for (let dy = 0; dy < buildingSize.y; dy++) {
                for (let dz = 0; dz < buildingSize.z; dz++) {
                  const ax = buildingPosition.x + dx;
                  const ay = buildingPosition.y + dy;
                  const az = buildingPosition.z + dz;
                  const k = _getKey(new THREE.Vector3(ax, ay, az).multiplyScalar(w));
                  seenBuildings[k] = true;
                }
              }
            }
          };
          const _draw = () => {
            for (let dx = 0; dx < buildingSize.x; dx++) {
              for (let dy = 0; dy < buildingSize.y; dy++) {
                const ax = buildingPosition.x + dx;
                const ay = buildingPosition.y + dy;
                const az = buildingPosition.z;

                const quaternion = new THREE.Quaternion();
                const g = wallGeometry.clone()
                  .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
                  .applyMatrix4(new THREE.Matrix4().makeTranslation(ax * w, ay * w, az * w));
                _mergeGeometry(g, {
                  position: new THREE.Vector3(ax * w, ay * w, az * w).add(new THREE.Vector3(0, w/2, -w/2).applyQuaternion(quaternion)),
                  quaternion,
                  scale: new THREE.Vector3(w, w, 0.1).divideScalar(2),
                });
              }
              for (let dy = 0; dy < buildingSize.y; dy++) {
                const ax = buildingPosition.x + dx;
                const ay = buildingPosition.y + dy;
                const az = buildingPosition.z + buildingSize.z - 1;

                const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
                const g = wallGeometry.clone()
                  .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
                  .applyMatrix4(new THREE.Matrix4().makeTranslation(ax * w, ay * w, az * w));
                _mergeGeometry(g, {
                  position: new THREE.Vector3(ax * w, ay * w, az * w).add(new THREE.Vector3(0, w/2, -w/2).applyQuaternion(quaternion)),
                  quaternion,
                  scale: new THREE.Vector3(w, w, 0.1).divideScalar(2),
                });
              }
            }
            for (let dz = 0; dz < buildingSize.z; dz++) {
              for (let dy = 0; dy < buildingSize.y; dy++) {
                const ax = buildingPosition.x;
                const ay = buildingPosition.y + dy;
                const az = buildingPosition.z + dz;

                const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI/2);
                const g = wallGeometry.clone()
                  .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
                  .applyMatrix4(new THREE.Matrix4().makeTranslation(ax * w, ay * w, az * w));
                _mergeGeometry(g, {
                  position: new THREE.Vector3(ax * w, ay * w, az * w).add(new THREE.Vector3(0, w/2, -w/2).applyQuaternion(quaternion)),
                  quaternion,
                  scale: new THREE.Vector3(w, w, 0.1).divideScalar(2),
                });
              }
              for (let dy = 0; dy < buildingSize.y; dy++) {
                const ax = buildingPosition.x + buildingSize.x - 1;
                const ay = buildingPosition.y + dy;
                const az = buildingPosition.z + dz;

                const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI/2);
                const g = wallGeometry.clone()
                  .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
                  .applyMatrix4(new THREE.Matrix4().makeTranslation(ax * w, ay * w, az * w));
                _mergeGeometry(g, {
                  position: new THREE.Vector3(ax * w, ay * w, az * w).add(new THREE.Vector3(0, w/2, -w/2).applyQuaternion(quaternion)),
                  quaternion,
                  scale: new THREE.Vector3(w, w, 0.1).divideScalar(2),
                });
              }
            }

            // roof
            for (let dx = 0; dx < buildingSize.x; dx++) {
              for (let dz = 0; dz < buildingSize.z; dz++) {
                const ax = buildingPosition.x + dx;
                const ay = buildingPosition.y + buildingSize.y;
                const az = buildingPosition.z + dz;

                const g = floorGeometry.clone()
                  .applyMatrix4(new THREE.Matrix4().makeTranslation(ax * w, ay * w, az * w));
                _mergeGeometry(g, {
                  position: new THREE.Vector3(ax * w, ay * w, az * w),
                  quaternion: new THREE.Quaternion(),
                  scale: new THREE.Vector3(w, 0.1, w).divideScalar(2),
                });
              }
            }

            const r = rng();
            if (r < 0.5) {
              const parcelSpec = {
                position: new THREE.Vector3((buildingPosition.x - 0.5) * w, (buildingPosition.y + buildingSize.y) * w, (buildingPosition.z - 0.5) * w),
                size: new THREE.Vector3(buildingSize.x * w, 0, buildingSize.z * w),
              };
              parcelSpecs.push(parcelSpec);
            }
          };
          if (_fits()) {
            _mark();
            _draw();
            break;
          } else {
            continue;
          }
        }
      }

      const seenPositions = {};

      const roadLength = 30;
      let lastDirection = new THREE.Vector3();
      let lastGeometryType = 'floor';
      for (let i = 0; i < roadLength; i++) {
        if (lastGeometryType === 'floor') {
          const g = floorGeometry.clone();
          g.applyMatrix4(new THREE.Matrix4().makeTranslation(position.x, position.y, position.z));
          _mergeGeometry(g, {
            position,
            quaternion: new THREE.Quaternion(),
            scale: new THREE.Vector3(w, 0.1, w).divideScalar(2),
          });
        } else if (lastGeometryType === 'ramp') {
          const g = rampGeometry.clone();
          const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(lastDirection.x, 0, lastDirection.z));
          g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion));
          g.applyMatrix4(new THREE.Matrix4().makeTranslation(position.x, position.y, position.z));
          _mergeGeometry(g, {
            position: position.clone().add(new THREE.Vector3(0, w/2, 0)),
            quaternion: quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI/4)),
            scale: new THREE.Vector3(w, 0.1, Math.sqrt(2*(w**2))).divideScalar(2),
          });
        }

        const k = _getKey(position);
        seenPositions[k] = lastGeometryType;

        if (lastGeometryType === 'ramp') {
          position.y += w;
        }

        for (;;) {
          let direction, geometryType;
          if (lastGeometryType === 'floor') {
            direction = (() => {
              const r = rng();
              if (r < 1/4) {
                return new THREE.Vector3(-1, 0, 0);
              } else if (r < 2/4) {
                return new THREE.Vector3(1, 0, 0);
              } else if (r < 3/4) {
                return new THREE.Vector3(0, 0, -1);
              } else {
                return new THREE.Vector3(0, 0, 1);
              }
            })();
            const r = rng();
            if (r < 0.25) {
              // direction.y += 0.5;
              geometryType = 'ramp';
            } else {
              geometryType = 'floor';
            }
          } else {
            const r = rng();
            if (r < 0.5) { // end
              direction = lastDirection.clone();
              // direction.y = 0;
              geometryType = 'floor';
            } else { // continue
              direction = lastDirection.clone();
              geometryType = 'ramp';
            }
          }
          // console.log('got direction', direction.toArray(), geometryType);

          const nextPosition = position.clone().add(direction.clone().multiplyScalar(w));
          const k = _getKey(nextPosition);
          if (!seenPositions[k] && seenPositions[_getKey(nextPosition.clone().sub(new THREE.Vector3(0, w, 0)))] !== 'ramp') {
            position.copy(nextPosition);
            lastDirection = direction;
            lastGeometryType = geometryType;
            break;
          } else {
            continue;
          }
        }
      }
      // console.log('draw range', indices, indexIndex/3);

      const geometry = BufferGeometryUtils.mergeBufferGeometries(geometries);
      /* geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.setDrawRange(0, indexIndex); */

      /* const material = new THREE.ShaderMaterial({
        uniforms: {
        },
        vertexShader: `\
          precision highp float;
          precision highp int;

          uniform vec4 uSelectRange;

          // attribute vec3 barycentric;
          attribute float ao;
          attribute float skyLight;
          attribute float torchLight;

          varying vec3 vViewPosition;
          varying vec2 vUv;
          varying vec3 vBarycentric;
          varying float vAo;
          varying float vSkyLight;
          varying float vTorchLight;
          varying vec3 vSelectColor;
          varying vec2 vWorldUv;
          varying vec3 vPos;
          varying vec3 vNormal;

          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            vViewPosition = -mvPosition.xyz;
            vUv = uv;
            // vBarycentric = barycentric;
            float vid = float(gl_VertexID);
            if (mod(vid, 3.) < 0.5) {
              vBarycentric = vec3(1., 0., 0.);
            } else if (mod(vid, 3.) < 1.5) {
              vBarycentric = vec3(0., 1., 0.);
            } else {
              vBarycentric = vec3(0., 0., 1.);
            }
            vAo = ao/27.0;
            vSkyLight = skyLight/8.0;
            vTorchLight = torchLight/8.0;

            vSelectColor = vec3(0.);
            if (
              position.x >= uSelectRange.x &&
              position.z >= uSelectRange.y &&
              position.x < uSelectRange.z &&
              position.z < uSelectRange.w
            ) {
              vSelectColor = vec3(${new THREE.Color(0x4fc3f7).toArray().join(', ')});
            }

            vec3 vert_tang;
            vec3 vert_bitang;
            if (abs(normal.y) < 0.05) {
              if (abs(normal.x) > 0.95) {
                vert_bitang = vec3(0., 1., 0.);
                vert_tang = normalize(cross(vert_bitang, normal));
                vWorldUv = vec2(dot(position, vert_tang), dot(position, vert_bitang));
              } else {
                vert_bitang = vec3(0., 1., 0.);
                vert_tang = normalize(cross(vert_bitang, normal));
                vWorldUv = vec2(dot(position, vert_tang), dot(position, vert_bitang));
              }
            } else {
              vert_tang = vec3(1., 0., 0.);
              vert_bitang = normalize(cross(vert_tang, normal));
              vWorldUv = vec2(dot(position, vert_tang), dot(position, vert_bitang));
            }
            vWorldUv /= 4.0;
            vec3 vert_norm = normal;

            vec3 t = normalize(normalMatrix * vert_tang);
            vec3 b = normalize(normalMatrix * vert_bitang);
            vec3 n = normalize(normalMatrix * vert_norm);
            mat3 tbn = transpose(mat3(t, b, n));

            vPos = position;
            vNormal = normal;
          }
        `,
        fragmentShader: `\
          precision highp float;
          precision highp int;

          #define PI 3.1415926535897932384626433832795

          uniform float sunIntensity;
          uniform sampler2D tex;
          // uniform float uTime;
          uniform vec3 sunDirection;
          float parallaxScale = 0.3;
          float parallaxMinLayers = 50.;
          float parallaxMaxLayers = 50.;

          varying vec3 vViewPosition;
          varying vec2 vUv;
          varying vec3 vBarycentric;
          varying float vAo;
          varying float vSkyLight;
          varying float vTorchLight;
          varying vec3 vSelectColor;
          varying vec2 vWorldUv;
          varying vec3 vPos;
          varying vec3 vNormal;

          float edgeFactor(vec2 uv) {
            float divisor = 0.5;
            float power = 0.5;
            return min(
              pow(abs(uv.x - round(uv.x/divisor)*divisor), power),
              pow(abs(uv.y - round(uv.y/divisor)*divisor), power)
            ) > 0.1 ? 0.0 : 1.0;
          }

          vec3 getTriPlanarBlend(vec3 _wNorm){
            // in wNorm is the world-space normal of the fragment
            vec3 blending = abs( _wNorm );
            // blending = normalize(max(blending, 0.00001)); // Force weights to sum to 1.0
            // float b = (blending.x + blending.y + blending.z);
            // blending /= vec3(b, b, b);
            // return min(min(blending.x, blending.y), blending.z);
            blending = normalize(blending);
            return blending;
          }

          void main() {
            // vec3 diffuseColor1 = vec3(${new THREE.Color(0x1976d2).toArray().join(', ')});
            vec3 diffuseColor2 = vec3(${new THREE.Color(0x64b5f6).toArray().join(', ')});
            float normalRepeat = 1.0;

            vec3 blending = getTriPlanarBlend(vNormal);
            float xaxis = edgeFactor(vPos.yz * normalRepeat);
            float yaxis = edgeFactor(vPos.xz * normalRepeat);
            float zaxis = edgeFactor(vPos.xy * normalRepeat);
            float f = xaxis * blending.x + yaxis * blending.y + zaxis * blending.z;

            // vec2 worldUv = vWorldUv;
            // worldUv = mod(worldUv, 1.0);
            // float f = edgeFactor();
            // float f = max(normalTex.x, normalTex.y, normalTex.z);

            float d = gl_FragCoord.z/gl_FragCoord.w;
            vec3 c = diffuseColor2; // mix(diffuseColor1, diffuseColor2, abs(vPos.y/10.));
            // float f2 = 1. + d/10.0;
            gl_FragColor = vec4(c, 0.5 + max(f, 0.3));
          }
        `,
        transparent: true,
        // polygonOffset: true,
        // polygonOffsetFactor: -1,
        // polygonOffsetUnits: 1,
      }); */
      
      const material = floorMesh.material;
      const roadMesh = new THREE.Mesh(geometry, material);
      roadMesh.frustumCulled = false;
      object.add(roadMesh);
      // const roadPhysicsId = physics.addGeometry(roadMesh);
    })();

    /* (async () => {
      const signsMesh = await new Promise((accept, reject) => {
        gltfLoader.load(`https://webaverse.github.io/street-assets/sign.glb`, function(object) {
          object = object.scene;

          accept(object);
        }, function progress() {}, reject);
      });

      const signMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(12, 3), new THREE.MeshBasicMaterial({
        color: 0x111111,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      }));
      signMesh.position.set(10/2, 2, 10);
      signMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI/2);

      const japanese = signsMesh.getObjectByName('Japanese');
      
      japanese.position.set(-4, 0, 0.05);
      japanese.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI/2));
      japanese.material = new THREE.MeshBasicMaterial({
        color: 0x26c6da,
        side: THREE.DoubleSide,
      });
      signMesh.add(japanese);

      const english = signsMesh.getObjectByName('English');
      english.position.set(2, -0.5, 0.01);
      english.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI/2));
      english.material = new THREE.MeshBasicMaterial({
        color: 0xec407a,
        side: THREE.DoubleSide,
      });
      signMesh.add(english);

      object.add(signMesh);
    })(); */

    {
      const width = stacksBoundingBox.max.x - stacksBoundingBox.min.x;
      const depth = stacksBoundingBox.max.y - stacksBoundingBox.min.y;
      const center = stacksBoundingBox.min.clone().add(stacksBoundingBox.max).divideScalar(2);
      const terrainMesh = (() => {
        const geometry = (() => {
          // const s = 300;
          // const maxManhattanDistance = localVector2D.set(0, 0).manhattanDistanceTo(localVector2D2.set(s/2, s/2));

          let geometry = new THREE.PlaneBufferGeometry(width, depth, width, depth)
            .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))))
            .applyMatrix4(new THREE.Matrix4().makeTranslation(center.x, 0, center.y));

          for (let i = 0; i < geometry.attributes.position.array.length; i += 3) {
            const x = geometry.attributes.position.array[i];
            const z = geometry.attributes.position.array[i+2];
            const d = Math.abs(x); 
            const f = Math.min(Math.max((d - 5) / 30, 0), 1)**2;
            const y = Math.min((10 + terrainSimplex.noise2D(x/500, z/500) * 10) * f, 100);
            // console.log('got distance', z, d/maxDistance);
            geometry.attributes.position.array[i+1] = y;
          }
          for (let i = 0; i < geometry.attributes.uv.array.length; i += 2) {
            geometry.attributes.uv.array[i] *= width;
            geometry.attributes.uv.array[i+1] *= depth;
          }
          /* const dynamicPositionYs = new Float32Array(geometry.attributes.position.array.length/3);
          for (let i = 0; i < dynamicPositionYs.length; i += 3) {
            const x = geometry.attributes.position.array[i*3];
            const z = geometry.attributes.position.array[i*3+2];

            // const d = Math.abs(x); 
            // const f = Math.min(Math.max((d - 5) / 30, 0), 1)**2;

            const y = simplex3.noise2D(x/500, z/500) * 3;
            dynamicPositionYs[i] = y;
            dynamicPositionYs[i+1] = y;
            dynamicPositionYs[i+2] = y;
          }
          geometry.setAttribute('dynamicPositionY', new THREE.BufferAttribute(dynamicPositionYs, 1)); */
          
          geometry.computeVertexNormals();

          geometry = geometry.toNonIndexed();
          /* const barycentrics = new Float32Array(geometry.attributes.position.array.length);
          let barycentricIndex = 0;
          for (let i = 0; i < geometry.attributes.position.array.length; i += 9) {
            barycentrics[barycentricIndex++] = 1;
            barycentrics[barycentricIndex++] = 0;
            barycentrics[barycentricIndex++] = 0;
            barycentrics[barycentricIndex++] = 0;
            barycentrics[barycentricIndex++] = 1;
            barycentrics[barycentricIndex++] = 0;
            barycentrics[barycentricIndex++] = 0;
            barycentrics[barycentricIndex++] = 0;
            barycentrics[barycentricIndex++] = 1;
          }
          geometry.setAttribute('barycentric', new THREE.BufferAttribute(barycentrics, 3)); */

          return geometry;
        })();

        const prefix = 'Vol_21_4';

        const diffuse1Promise = _makePromise();
        const diffuse1 = textureLoader.load(`https://webaverse.github.io/street-assets/textures/${prefix}_Base_Color.jpg`, diffuse1Promise.accept);
        diffuse1.wrapS = THREE.RepeatWrapping;
        diffuse1.wrapT = THREE.RepeatWrapping;
        diffuse1.anisotropy = 16;
        loadPromises.push(diffuse1Promise);

        const normal1Promise = _makePromise();
        const normal1 = textureLoader.load(`https://webaverse.github.io/street-assets/textures/${prefix}_Normal.jpg`, normal1Promise.accept);
        normal1.wrapS = THREE.RepeatWrapping;
        normal1.wrapT = THREE.RepeatWrapping;
        normal1.anisotropy = 16;
        loadPromises.push(normal1Promise);

        const material = new THREE.ShaderMaterial({
          uniforms: {
            uDiffuse1: {
              type: 't',
              value: diffuse1,
            },
            uNormal1: {
              type: 't',
              value: normal1,
            },
          },
          vertexShader: `\
            ${THREE.ShaderChunk.common}
            ${THREE.ShaderChunk.logdepthbuf_pars_vertex}
            attribute float y;
            attribute vec3 barycentric;
            // attribute float dynamicPositionY;
            // uniform float uBeat2;
            varying vec3 vNormal;
            varying vec2 vUv;
            // varying vec3 vBarycentric;
            varying vec3 vPosition;

            void main() {
              vUv = uv / 4.;
              vNormal = normal;
              // vBarycentric = barycentric;
              vPosition = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

              ${THREE.ShaderChunk.logdepthbuf_vertex}
            }
          `,
          fragmentShader: `\
            precision highp float;
            precision highp int;

            uniform sampler2D uDiffuse1;
            uniform sampler2D uNormal1;

            // varying vec3 vBarycentric;
            varying vec3 vPosition;
            varying vec2 vUv;
            varying vec3 vNormal;

            const vec3 lineColor1 = vec3(${new THREE.Color(0x66bb6a).toArray().join(', ')});
            const vec3 lineColor2 = vec3(${new THREE.Color(0x9575cd).toArray().join(', ')});

            ${THREE.ShaderChunk.logdepthbuf_pars_fragment}

            float edgeFactor(vec3 bary, float width) {
              // vec3 bary = vec3(vBC.x, vBC.y, 1.0 - vBC.x - vBC.y);
              vec3 d = fwidth(bary);
              vec3 a3 = smoothstep(d * (width - 0.5), d * (width + 0.5), bary);
              return min(min(a3.x, a3.y), a3.z);
            }

            void main() {
              // vec3 c = mix(lineColor1, lineColor2, vPosition.y / 10.);
              vec3 c = texture2D(uDiffuse1, vUv).rgb;
              vec3 n = texture2D(uNormal1, vUv).rgb * vNormal;
              vec3 l = normalize(vec3(-1., -2., -3.));
              c *= 0.5 + abs(dot(n, l));
              // c.rb += vUv;
              // vec3 p = fwidth(vPosition);
              // vec3 p = vPosition;
              c += vPosition.y / 30.;
              gl_FragColor = vec4(c, 1.);

              ${THREE.ShaderChunk.logdepthbuf_fragment}
            }
          `,
          side: THREE.DoubleSide,
          transparent: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        return mesh;
      })();
      // terrainMesh.position.set(center.x, 0, center.y);
      object.add(terrainMesh);
      const physicsId = physics.addGeometry(terrainMesh);
      physicsIds.push(physicsId);
    }

    (async () => {
      const rng = alea('lol');
      
      const modularMesh = await new Promise((accept, reject) => {
        gltfLoader.load(`https://webaverse.github.io/street-assets/stacks.glb`, function(object) {
          object = object.scene;

          accept(object);
        }, function progress() {}, reject);
      });
      const floorMap = {
        [JSON.stringify([
          [0, 0, 0],
          [0, 1, 0],
          [0, 0, 0],
        ])]: {
          name: 'Floor',
          quaternion: new THREE.Quaternion(),
        },
        [JSON.stringify([
          [0, 1, 0],
          [0, 1, 0],
          [0, 0, 0],
        ])]: {
          name: 'I',
          quaternion: new THREE.Quaternion(),
        },
        [JSON.stringify([
          [0, 0, 0],
          [1, 1, 0],
          [0, 0, 0],
        ])]: {
          name: 'I',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI/2),
        },
        [JSON.stringify([
          [0, 0, 0],
          [0, 1, 0],
          [0, 1, 0],
        ])]: {
          name: 'I',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
        },
        [JSON.stringify([
          [0, 0, 0],
          [0, 1, 1],
          [0, 0, 0],
        ])]: {
          name: 'I',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI*3/2),
        },
        [JSON.stringify([
          [0, 1, 0],
          [1, 1, 0],
          [0, 0, 0],
        ])]: {
          name: 'R',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
        },
        [JSON.stringify([
          [0, 0, 0],
          [1, 1, 0],
          [0, 1, 0],
        ])]: {
          name: 'R',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI*3/2),
        },
        [JSON.stringify([
          [0, 0, 0],
          [0, 1, 1],
          [0, 1, 0],
        ])]: {
          name: 'R',
          quaternion: new THREE.Quaternion(),
        },
        [JSON.stringify([
          [0, 1, 0],
          [0, 1, 1],
          [0, 0, 0],
        ])]: {
          name: 'R',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI/2),
        },
        [JSON.stringify([
          [0, 1, 0],
          [0, 1, 0],
          [0, 1, 0],
        ])]: {
          name: '-',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI/2),
        },
        [JSON.stringify([
          [0, 0, 0],
          [1, 1, 1],
          [0, 0, 0],
        ])]: {
          name: '-',
          quaternion: new THREE.Quaternion(),
        },
        [JSON.stringify([
          [0, 0, 0],
          [1, 1, 1],
          [0, 1, 0],
        ])]: {
          name: 'T',
          quaternion: new THREE.Quaternion(),
        },
        [JSON.stringify([
          [0, 1, 0],
          [0, 1, 1],
          [0, 1, 0],
        ])]: {
          name: 'T',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI/2),
        },
        [JSON.stringify([
          [0, 1, 0],
          [1, 1, 1],
          [0, 0, 0],
        ])]: {
          name: 'T',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),
        },
        [JSON.stringify([
          [0, 1, 0],
          [1, 1, 0],
          [0, 1, 0],
        ])]: {
          name: 'T',
          quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI*3/2),
        },
        [JSON.stringify([
          [0, 1, 0],
          [1, 1, 1],
          [0, 1, 0],
        ])]: {
          name: 'O',
          quaternion: new THREE.Quaternion(),
        },
      };

      const geometries = [];
      const _mergeMesh = (m, p, q) => {
        const g = m.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().compose(
          p.clone()
            .add(new THREE.Vector3(0, (((p.x + p.z) / w) % 2) === 0 ? 0.001 : 0, 0)), // slight offset to remove y glitching
          q,
          localVector.set(1, 1, 1)
        ));
        geometries.push(g);
      };

      for (let dy = 0; dy < 10; dy++) {
        const width = 2 + Math.floor(rng() * 10);
        const height = 2 + Math.floor(rng() * 10);
        const testMap = Array(height);
        for (let i = 0; i < height; i++) {
          testMap[i] = Array(width).fill(0);
        }
        const [
          startPoint,
          startPoint2,
        ] = (() => {
          const r = rng();
          if (r < 0.25) { // left
            const v = new THREE.Vector2(-1, Math.floor(rng() * height));
            return [
              v,
              v.clone().add(new THREE.Vector2(1, 0)),
            ];
          } else if (r < 0.5) { // right
            const v = new THREE.Vector2(width, Math.floor(rng() * height));
            return [
              v,
              v.clone().add(new THREE.Vector2(-1, 0)),
            ];
          } else if (r < 0.75) { // up
            const v = new THREE.Vector2(Math.floor(rng() * width), -1);
            return [
              v,
              v.clone().add(new THREE.Vector2(0, 1)),
            ];
          } else { // down
            const v = new THREE.Vector2(Math.floor(rng() * width), height);
            return [
              v,
              v.clone().add(new THREE.Vector2(0, -1)),
            ];
          }
        })();
        const _walkTestMap = () => {
          const walkLength = Math.floor(1 + rng() * width * height);
          const position = startPoint2.clone();
          for (let i = 0; i < walkLength; i++) {
            if (position.x >= testMap[position.y].length) {
              debugger;
            }
            testMap[position.y][position.x] = 1;
            const r = rng();
            if (r < 0.25) { // left
              position.x = Math.max(position.x - 1, 0);
            } else if (r < 0.5) { // right
              position.x = Math.min(position.x + 1, width - 1);
            } else if (r < 0.75) { // up
              position.y = Math.max(position.y - 1, 0);
            } else { // down
              position.y = Math.min(position.y + 1, height - 1);
            }
          }
        };
        _walkTestMap();

        /* if (dy !== 4) {
          continue;
        } */

        const _printTestMap = testMap => {
          console.log(testMap.map(l => l.join(',')).join('\n'));
        };
        // _printTestMap(testMap);

        const _getTestMap = (x, z) => {
          if (x === startPoint.x && z === startPoint.y) {
            return 1;
          } else {
            return (testMap[z] || [])[x] || 0;
          }
        };
        for (let dx = 0; dx < width; dx++) {
          for (let dz = 0; dz < height; dz++) {
            if (_getTestMap(dx, dz)) {
              const up = _getTestMap(dx, dz - 1);
              const left = _getTestMap(dx - 1, dz);
              const right = _getTestMap(dx + 1, dz);
              const down = _getTestMap(dx, dz + 1);
              
              const j = [
                [0, up, 0],
                [left, 1, right],
                [0, down, 0],
              ];
              const s = JSON.stringify(j);
              const entry = floorMap[s];
              
              if (entry) {
                const o = modularMesh.getObjectByName(entry.name);
                if (o) {
                  _mergeMesh(o, new THREE.Vector3(dx*w + w*3, dy*w, dz*w), entry.quaternion);
                } else {
                  debugger;
                }
              } else {
                debugger;
              }
            }
          }
        }
      }

      const geometry = BufferGeometryUtils.mergeBufferGeometries(geometries);
      const material = modularMesh.getObjectByName('O').material;
      const modularMeshSingle = new THREE.Mesh(geometry, material);
      modularMeshSingle.frustumCulled = false;
      object.add(modularMeshSingle);
      const physicsId = physics.addGeometry(modularMeshSingle);
      physicsIds.push(physicsId);
    })();

    return object;
  })();
  object.add(stacksMesh);

  (async () => {
    const p = new Promise((accept, reject) => {
      gltfLoader.load(`https://webaverse.github.io/street-assets/sakura.glb`, function(object) {
        // console.log('loaded', object);
        object = object.scene;
        object.scale.multiplyScalar(3);
        // object.position.y = 2;
        // window.object = object;
        // scene.add( object );
        // app.object.add(object);
        accept(object);
        // render();
      }, function progress() {}, reject);
    });
    loadPromises.push(p);
    const sakuraMesh = await p;
    for (const parcelSpec of parcelSpecs) {
      const m = sakuraMesh.clone();
      m.position.copy(parcelSpec.position)
        .add(parcelSpec.size.clone().multiplyScalar(0.5));
      object.add(m);
      m.updateMatrixWorld();
    }
  })();
  
  useCleanup(() => {
    for (const physicsId of physicsIds) {
      physics.removeGeometry(physicsId);
    }
  });
  
  return object;
};
