// -*-C++-*-

// Ambient term comes in gl_Color.rgb.
#version 120

varying vec4 diffuse_term;
varying vec3 normal;
varying vec3 ecViewDir;
varying vec3 VTangent;

uniform float shade_effect;
uniform float sun_angle;
uniform float air_pollution;
uniform float moonlight;

uniform float roi_x1;
uniform float roi_y1;
uniform float lightning;
uniform float cloudcover_bias;

uniform bool use_overlay;
uniform bool use_cloud_normals;

uniform sampler2D texture;
uniform sampler2D structure_texture;


const float cloud_vscale = 0.0013;
const float cloud_vrange = 0.0007;
const float nbase = 14.0;
const float nhuge = 24.0;

float Noise2D(in vec2 coord, in float wavelength);

vec3 filter_combined (in vec3 color) ;
vec3 moonlight_perception (in vec3 light);

float add_cosines (in float cos1, in float cos2, in float sign)
{

  float sin1 = sqrt(1.0 - pow(cos1, 2.0));
  float sin2 = sqrt(1.0 - pow(cos2, 2.0));

  return cos1 * cos2 + sign *  sin1 * sin2;

}

vec3 lightning_color (in vec2 coord)
{

  vec2 roi1 = vec2 (roi_x1, roi_y1);

  float strength = 1.0 - smoothstep(0.0, 0.005, length(roi1 - coord));

  return strength * vec3 (0.43, 0.57, 1.0);

}



vec2 delta_parallax_angle_mapping(vec3 viewDir)
{
  return viewDir.st*cloud_vscale*sqrt(1.0-viewDir.z*viewDir.z);
  // /viewdir.z
}


vec2 delta_parallax_interstep_mapping(vec2 texCoords, vec3 viewDir)
{
  vec3 mover;
  vec3 dview;
  
  float sdir;
  float height;
  float prevheight = 0.0;
  float weight=0.0;

  float nsteps = min(nbase/max(0.001,viewDir.z),nhuge);
  float stepsize = cloud_vrange/nbase;

  float noise;
  
  mover = vec3(texCoords,0.0);
  
  height = cloud_vrange * texture2D(texture, mover.xy).a;
  
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

      //      height = cloud_vrange * texture2D(texture, mover.xy).a;
      
      noise = Noise2D(mover.xy,0.0005);
      noise += 0.8*Noise2D(mover.xy,0.0002);
      noise += 0.4*Noise2D(mover.xy,0.0001);
      noise += 0.3*Noise2D(mover.xy,0.00004);
      noise += 0.2*Noise2D(mover.xy,0.00002);
      noise = noise/2.7;
      
      height = cloud_vrange * (0.3+0.7*noise) * texture2D(texture, mover.xy).a;
      
    }
  
  return mover.st - dview.st*weight - texCoords;
  
}



void main()
{
  vec3 n;
  float NdotL, NdotHV, NdotLraw;
  vec4 color = gl_Color;
  vec3 lightDir = normalize(gl_LightSource[0].position.xyz);
  vec3 EmDir = normalize(ecViewDir);
  //vec3 halfVector = normalize(lightDir + EmDir);
  vec3 V;
  vec3 L;
  vec4 texel;
  vec4 ref_texel;
  vec4 structureTexel;

  vec2 texCoord = gl_TexCoord[0].st;
  vec2 dtexCoord = vec2(0.0,0.0);
  
  vec4 fragColor;
  vec4 specular = vec4(0.0, 0.0, 0.0, 0.0);

  n = normalize(normal);

	
  vec3 light_specular = vec3 (1.0, 1.0, 1.0);
  NdotL = dot(n, lightDir);
  NdotLraw = NdotL;
  NdotL = smoothstep(-0.2,0.2,NdotL);	

  float intensity = length(diffuse_term.rgb);

  vec3 dawn_color = mix (vec3 (1.0,0.7,0.4), vec3 (1.0,0.4,0.2), air_pollution);

  vec3 dawn = intensity * 1.2 * normalize (dawn_color);
	
  vec4 diff_term = mix(vec4(dawn, 1.0), diffuse_term, smoothstep(0.0, 0.45, NdotL));


  vec2 grad_dir = vec2 (1.0, 0.0);

  vec3 tangent = normalize(VTangent);
  vec3 binormal = cross(n, tangent);
  float NdotL2 = 1.0;
    
  texel = texture2D(texture, texCoord);
  ref_texel = texel;
	
  float sign = -1.0;
  float ml_fact = 1.0;

	
  if (use_cloud_normals)
    {

      vec2 sun2d = vec2 (0.0, 1.0);

      
      //float xOffset = -1.0 * dot(lightDir, tangent);
      //float yOffset = -1.0 * dot(lightDir, binormal);			
      //grad_dir = normalize (vec2 (xOffset, yOffset));
      //vec4 comp_texel = texture2D(texture, texCoord - 0.0005 * grad_dir);

      L = vec3(dot(tangent,lightDir),dot(binormal,lightDir),dot(n,lightDir));
      dtexCoord = delta_parallax_angle_mapping(L);
      vec4 comp_texel = texture2D(texture, texCoord + dtexCoord);


      
      // parallax mapping
			
      //xOffset = -1.0 * dot(ecViewDir, tangent);
      //yOffset = -1.0 * dot(ecViewDir, binormal);				
      //grad_dir = normalize (vec2 (xOffset, yOffset));
      //texel = texture2D(texture, texCoord - 0.0005 * grad_dir * ref_texel.a * 0.7);
      
      V = vec3(dot(tangent,EmDir),dot(binormal,EmDir),dot(n,EmDir));
      dtexCoord = delta_parallax_angle_mapping(V);
      
      dtexCoord = dtexCoord + delta_parallax_interstep_mapping(texCoord+dtexCoord,V);


      texel = texture2D(texture, texCoord + dtexCoord);

      // relief shading based on gradient and parallax lookup
		
      float slope = shade_effect * (comp_texel.a - ref_texel.a) * texel.a;

      if (slope < 0.0) {sign = 1.0;}
		
      vec2 snormal = normalize(vec2 (slope, 1.0));

      NdotL2 = dot (snormal, sun2d);
      NdotL = add_cosines(NdotL, NdotL2, sign );
		
      ml_fact = 0.5 + 1.0 * add_cosines(0.0, NdotL2, sign); 

			
    }
	
  ref_texel = texel;
  texel.a = pow(texel.a,1.0/cloudcover_bias);
  texel.a = clamp(texel.a, 0.0, 1.0);

	
  color += diff_term * max(NdotL, 0.15) ;



	

  color.rgb *= smoothstep(-0.2, -0.1, NdotLraw);
  //
	
  float darkness_fact = 1.0 - smoothstep(0.0,0.2, length(color.rgb));
  color.rgb += lightning_color(gl_TexCoord[0].st) * (1.0 - texel.a) * lightning * darkness_fact;
	
  vec3 moonLightColor = vec3 (0.095, 0.095, 0.15) * moonlight;
  moonLightColor = moonlight_perception (moonLightColor);  
  color.rgb += moonLightColor * ml_fact;
    
  color.a = 1.0;//diffuse_term.a;
  color = clamp(color, 0.0, 1.0);
 
  
  if (use_overlay) 
    {
      structureTexel = texture2D(structure_texture, 20.0 * gl_TexCoord[0].st);

      float noise = Noise2D( gl_TexCoord[0].st, 0.01);
      noise += Noise2D( gl_TexCoord[0].st, 0.005);
      noise += Noise2D( gl_TexCoord[0].st, 0.002);
	

      vec4 noiseTexel = vec4 (1.0,1.0,1.0, 0.5* noise * texel.a);
      structureTexel = mix(structureTexel, noiseTexel,noiseTexel.a);

      structureTexel = mix(structureTexel, texel, clamp(1.5 * ref_texel.a * (cloudcover_bias - 1.0), 0.0, 1.0));


      

      texel = vec4(structureTexel.rgb, smoothstep(0.0, 0.5,texel.a) * structureTexel.a);
      //texel.a = pow(texel.a,1.0/cloudcover_bias);

    }
	
  texel.a = clamp((1.0 + darkness_fact) * texel.a, 0.0, 1.0);


  fragColor = color * texel;
  fragColor.rgb = filter_combined(fragColor.rgb);

  gl_FragColor = clamp(fragColor, 0.0, 1.0);


}
