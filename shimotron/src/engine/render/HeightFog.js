import * as THREE from 'three';

/**
 * Engine-wide height fog with sun in-scattering, patched into Three's
 * shared fog chunks so every built-in material gets it.
 *
 * Parameters live in plain {x,y,z,w} objects: UniformsUtils.clone copies
 * those by reference, so one write here reaches every compiled material.
 */
export const fogParams = {
  // x: height falloff, y: base height, z: sun scatter strength, w: max opacity
  shape: { x: 0.022, y: 0.0, z: 0.75, w: 0.98 },
  sunDir: { x: 0, y: 1, z: 0 },
  sunColor: { x: 1, y: 0.9, z: 0.7 },
};

const extraUniforms = {
  fogShape: { value: fogParams.shape },
  fogSunDir: { value: fogParams.sunDir },
  fogSunColor: { value: fogParams.sunColor },
};

/** Uniform block for custom ShaderMaterials that set `fog: true`. */
export function fogUniforms() {
  return THREE.UniformsUtils.merge([THREE.UniformsLib.fog, extraUniforms]);
}

let installed = false;

export function installHeightFog() {
  if (installed) return;
  installed = true;

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif`;

  // mvPosition exists in every built-in vertex shader (mesh, points, sprite)
  // and already includes instancing, batching, skinning and displacement.
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif`;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float fogNear;
  uniform float fogFar;
  uniform vec4 fogShape;
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;

  // Analytic integral of exponential height fog along the view ray.
  float shimoFogAmount( vec3 camPos, vec3 worldPos ) {
    vec3 ray = worldPos - camPos;
    float dist = length( ray );
    vec3 rd = ray / max( dist, 1e-4 );
    float b = fogShape.x;
    float ry = rd.y;
    if ( abs( ry ) < 1e-4 ) ry = 1e-4;
    float amount = fogDensity * exp( - ( camPos.y - fogShape.y ) * b ) * ( 1.0 - exp( - dist * ry * b ) ) / ( ry * b );
    return clamp( 1.0 - exp( - amount ), 0.0, fogShape.w );
  }

  vec3 shimoFogColor( vec3 rd ) {
    float s = pow( max( dot( rd, fogSunDir ), 0.0 ), 8.0 ) * fogShape.z;
    return mix( fogColor, fogSunColor, clamp( s, 0.0, 1.0 ) );
  }
#endif`;

  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  float fogFactor = shimoFogAmount( cameraPosition, vFogWorldPos );
  vec3 fogRd = normalize( vFogWorldPos - cameraPosition );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, shimoFogColor( fogRd ), fogFactor );
#endif`;

  // Give every built-in shader the extra uniforms (shared by reference).
  for (const lib of Object.values(THREE.ShaderLib)) {
    if (lib.uniforms && lib.uniforms.fogColor) Object.assign(lib.uniforms, extraUniforms);
  }
}
