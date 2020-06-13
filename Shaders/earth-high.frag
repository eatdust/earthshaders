// -*-C++-*-

// Ambient term comes in gl_Color.rgb.
#version 120

varying vec4 diffuse_term;
varying vec3 normal;
varying vec3 ecViewDir;
varying vec3 VTangent;

uniform float visibility;
uniform float air_pollution;
uniform float moonlight;
uniform float sun_angle;
uniform bool use_clouds;
uniform bool use_cloud_shadows;
uniform bool use_overlay;
uniform sampler2D texture;
uniform sampler2D shadowtex;
uniform sampler2D normal_texture;


const float relief_vscale = 0.0014;
const float cloud_vtop = 0.002;
const float nbase = 10.0;
const float nhuge = 32.0;


float Noise2D(in vec2 coord, in float wavelength);
vec3 filter_combined (in vec3 color) ;
vec3 moonlight_perception (in vec3 light);




vec2 parallax_interstep_mapping(vec2 texCoords, vec3 viewDir)
{
  vec3 mover;
  vec3 dview;
  
  float sdir;
  float height;
  float prevheight = 0.0;

  float weight=0.0;

  float nsteps = min(nbase/max(0.001,viewDir.z),nhuge);
  float stepsize = relief_vscale/nbase;
  
  mover = vec3(texCoords,0.0);
  
  height = relief_vscale * (1.0 - texture2D(normal_texture, mover.xy).a);
  
  
  sdir = sign(height);
  dview = sdir * viewDir * stepsize;
  
  
  for (int i=0; i<nsteps; i++)
    {
            
      if ( sdir*(mover.z - height) > 0.0 )
	{
	  //necessarily overshot, linear interpolation
	  weight = (mover.z-height)/(dview.z + prevheight-height);
	  break;
	}

      mover += dview;

      prevheight = height;
      height = relief_vscale * (1.0 - texture2D(normal_texture, mover.xy).a);

      
    }
  
  return mover.st - dview.st*weight;
  
}







void main()
{
  vec3 n;
  float NdotL, NdotHV;
  vec4 color = gl_Color;
  vec3 lightDir = normalize(gl_LightSource[0].position.xyz);
  vec3 EmDir = normalize(ecViewDir);
  vec3 halfVector = normalize(lightDir + EmDir);
  vec3 V;
  vec4 texel;
  vec4 shadowTexel;
  vec4 fragColor;
  vec4 specular = vec4(0.0);
  vec4 nmap;

  vec2 texCoord = gl_TexCoord[0].st;
  
  // If gl_Color.a == 0, this is a back-facing polygon and the
  // normal should be reversed.
  n = (2.0 * gl_Color.a - 1.0) * normal;
  n = normalize(n);
	
  vec3 B=normalize(cross(normal, VTangent));
  vec3 T=normalize(VTangent);
  
  V = vec3(dot(T,EmDir),dot(B,EmDir),dot(n,EmDir));

  texCoord = parallax_interstep_mapping(texCoord,V);
  
  nmap  = texture2D(normal_texture, texCoord.st);

		
  vec3 N = nmap.rgb * 2.0 - 1.0;
  N = normalize(N.x * T + N.y * B + N.z * n);

			
  if ((use_cloud_shadows)&&(use_clouds))    
    {
      float xOffset = -cloud_vtop * dot(lightDir, T);
      float yOffset = -cloud_vtop * dot(lightDir, B);
      shadowTexel = texture2D(shadowtex, vec2(gl_TexCoord[0].s-xOffset, gl_TexCoord[0].t-yOffset));
    }
  else
    {
      shadowTexel = vec4 (0.0,0.0,0.0,0.0);
    }	
 
  texel = texture2D(texture, texCoord.st);
  float night_light = (1.0 -texel.a);
  texel.a = 1.0;

  float smallnoise = Noise2D( gl_TexCoord[0].st, 0.000002);
  smallnoise += Noise2D( gl_TexCoord[0].st, 0.000005);
  smallnoise += Noise2D( gl_TexCoord[0].st, 0.00001);
  smallnoise += Noise2D( gl_TexCoord[0].st, 0.00002);
  smallnoise = smallnoise/4.0;
  
  float mediumnoise = Noise2D( gl_TexCoord[0].st, 0.00005);
  mediumnoise += Noise2D( gl_TexCoord[0].st, 0.0001);
  mediumnoise += Noise2D( gl_TexCoord[0].st, 0.0002);	
  mediumnoise= mediumnoise/3.0;

  float noise = 0.5*(smallnoise + mediumnoise);
  
  vec3 light_specular = vec3 (1.0, 1.0, 1.0);
  NdotL = dot(N, lightDir);
  float NdotLraw = NdotL;
  // due to atmosphere scattering, we should make this harder
  NdotL = smoothstep(-0.2 ,0.2,NdotL);	
  // fog does not feel normal map
  float NdotLfog = smoothstep(-0.2 , 0.2, dot(n, lightDir));
   
  float intensity = length(diffuse_term);
  vec4 dawn = intensity * normalize (vec4 (1.0,0.5,0.3,1.0));
  vec4 diff_term = mix(dawn, diffuse_term, smoothstep(0.0, 0.3, NdotL));

   
  intensity = length(light_specular);
  light_specular = mix(dawn.rgb, light_specular, smoothstep(0.0, 0.4, NdotL));
    
  float oceanness = smoothstep(0.05, 0.18,length(texel.rgb - vec3 (0.008,0.020, 0.078)));

  float specular_enhancement = 4.0*(1.0-oceanness)*(0.8 + 0.4*smallnoise);

  
  if (use_overlay) {
    texel.rgb = texel.rgb * (0.85 + 0.3 * noise);
    texel.r = smoothstep(0.0, 0.95, texel.r);
    texel.g = smoothstep(0.0, 0.95, texel.g);
    texel.b = smoothstep(0.0, 0.95, texel.b);
    float intensity = length(texel.rgb);
    texel.rgb = mix(texel.rgb, intensity * vec3 (1.0,1.0,1.0), 0.3);
  }

  //texel.rgb = vec3 (0.5,0.5,0.5);




  if (NdotL >= 0.0) {
    color += diff_term * NdotL * (1.0-shadowTexel.a);
    NdotHV = max(dot(N, halfVector),0.0);
    if (gl_FrontMaterial.shininess > 0.0)
      specular.rgb = (gl_FrontMaterial.specular.rgb * specular_enhancement
		      * light_specular * (1.0-shadowTexel.a)
		      * pow(NdotHV, gl_FrontMaterial.shininess));
  }
	
  vec3 moonLightColor = vec3 (0.095, 0.095, 0.15) * moonlight;
  moonLightColor = moonlight_perception (moonLightColor); 
  color.rgb += moonLightColor;
	
  color.a = diffuse_term.a;


  // This shouldn't be necessary, but our lighting becomes very
  // saturated. Clamping the color before modulating by the texture
  // is closer to what the OpenGL fixed function pipeline does.
  color = clamp(color, 0.0, 1.0);

  fragColor = color * texel + specular;


  float night_light_factor = night_light * (1.0 - smoothstep(-0.3, 0.0, NdotLraw));

  float noise_factor = (0.4 + 0.6* smoothstep(0.7 - 0.4* night_light,0.9 - 0.4 * night_light,noise));
  night_light_factor *= noise_factor;


  vec3 light_color = vec3(1.0, 0.7, 0.3);
  vec3 central_light_color = vec3 (1.0, 1.0, 1.0);
  light_color = mix(light_color, central_light_color, smoothstep(0.3, 0.6,noise*noise * night_light));
	
  fragColor.rgb += light_color * night_light_factor * 1.4;
	
  float angle = dot(normalize(ecViewDir), normalize(normal));
  float distance_through_atmosphere = min(10.0 / (abs(angle)+0.001),500.0);

   
  float fogLighting = clamp(NdotLfog,0.0,1.0) * length(diff_term.rgb/1.73);
	
  vec4 fogColor = vec4 (0.83,0.9,1.0,1.0) * fogLighting;
  vec3 rayleighColor = vec3 (0.17, 0.52, 0.87) * fogLighting;
		
  float heightFactor = exp(-(1.0 - nmap.a) * 0.8);
  distance_through_atmosphere *= heightFactor;
		
  float fogFactor = exp(-distance_through_atmosphere/(visibility/1000.0));
  float rayleighFactor = exp(-distance_through_atmosphere/(300.0 / (1.0 + 4.0 * air_pollution)) );
  

  
  fragColor.rgb = mix(rayleighColor, fragColor.rgb, rayleighFactor);
  fragColor = mix(fogColor, fragColor, fogFactor);

  fragColor.rgb = filter_combined(fragColor.rgb);


	

  gl_FragColor = clamp(fragColor, 0.0, 1.0);
		

}
