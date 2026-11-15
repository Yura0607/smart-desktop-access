/* Smart Desktop Access web client: remote controls menu. */
(function () {
  "use strict";
  var nacl = (function () { var module = { exports: {} }; var self = window;
!function(i){"use strict";var m=function(r,n){this.hi=0|r,this.lo=0|n},v=function(r){var n,e=new Float64Array(16);if(r)for(n=0;n<r.length;n++)e[n]=r[n];return e},a=function(){throw new Error("no PRNG")},o=new Uint8Array(16),e=new Uint8Array(32);e[0]=9;var c=v(),w=v([1]),g=v([56129,1]),y=v([30883,4953,19914,30187,55467,16705,2637,112,59544,30585,16505,36039,65139,11119,27886,20995]),l=v([61785,9906,39828,60374,45398,33411,5274,224,53552,61171,33010,6542,64743,22239,55772,9222]),t=v([54554,36645,11616,51542,42930,38181,51040,26924,56412,64982,57905,49316,21502,52590,14035,8553]),f=v([26200,26214,26214,26214,26214,26214,26214,26214,26214,26214,26214,26214,26214,26214,26214,26214]),s=v([41136,18958,6951,50414,58488,44335,6150,12099,55207,15867,153,11085,57099,20417,9344,11139]);function h(r,n){return r<<n|r>>>32-n}function b(r,n){var e=255&r[n+3];return(e=(e=e<<8|255&r[n+2])<<8|255&r[n+1])<<8|255&r[n+0]}function B(r,n){var e=r[n]<<24|r[n+1]<<16|r[n+2]<<8|r[n+3],t=r[n+4]<<24|r[n+5]<<16|r[n+6]<<8|r[n+7];return new m(e,t)}function p(r,n,e){var t;for(t=0;t<4;t++)r[n+t]=255&e,e>>>=8}function S(r,n,e){r[n]=e.hi>>24&255,r[n+1]=e.hi>>16&255,r[n+2]=e.hi>>8&255,r[n+3]=255&e.hi,r[n+4]=e.lo>>24&255,r[n+5]=e.lo>>16&255,r[n+6]=e.lo>>8&255,r[n+7]=255&e.lo}function u(r,n,e,t,o){var i,a=0;for(i=0;i<o;i++)a|=r[n+i]^e[t+i];return(1&a-1>>>8)-1}function A(r,n,e,t){return u(r,n,e,t,16)}function _(r,n,e,t){return u(r,n,e,t,32)}function U(r,n,e,t,o){var i,a,f,u=new Uint32Array(16),c=new Uint32Array(16),w=new Uint32Array(16),y=new Uint32Array(4);for(i=0;i<4;i++)c[5*i]=b(t,4*i),c[1+i]=b(e,4*i),c[6+i]=b(n,4*i),c[11+i]=b(e,16+4*i);for(i=0;i<16;i++)w[i]=c[i];for(i=0;i<20;i++){for(a=0;a<4;a++){for(f=0;f<4;f++)y[f]=c[(5*a+4*f)%16];for(y[1]^=h(y[0]+y[3]|0,7),y[2]^=h(y[1]+y[0]|0,9),y[3]^=h(y[2]+y[1]|0,13),y[0]^=h(y[3]+y[2]|0,18),f=0;f<4;f++)u[4*a+(a+f)%4]=y[f]}for(f=0;f<16;f++)c[f]=u[f]}if(o){for(i=0;i<16;i++)c[i]=c[i]+w[i]|0;for(i=0;i<4;i++)c[5*i]=c[5*i]-b(t,4*i)|0,c[6+i]=c[6+i]-b(n,4*i)|0;for(i=0;i<4;i++)p(r,4*i,c[5*i]),p(r,16+4*i,c[6+i])}else for(i=0;i<16;i++)p(r,4*i,c[i]+w[i]|0)}function E(r,n,e,t){U(r,n,e,t,!1)}function x(r,n,e,t){return U(r,n,e,t,!0),0}var d=new Uint8Array([101,120,112,97,110,100,32,51,50,45,98,121,116,101,32,107]);function K(r,n,e,t,o,i,a){var f,u,c=new Uint8Array(16),w=new Uint8Array(64);if(!o)return 0;for(u=0;u<16;u++)c[u]=0;for(u=0;u<8;u++)c[u]=i[u];for(;64<=o;){for(E(w,c,a,d),u=0;u<64;u++)r[n+u]=(e?e[t+u]:0)^w[u];for(f=1,u=8;u<16;u++)f=f+(255&c[u])|0,c[u]=255&f,f>>>=8;o-=64,n+=64,e&&(t+=64)}if(0<o)for(E(w,c,a,d),u=0;u<o;u++)r[n+u]=(e?e[t+u]:0)^w[u];return 0}function Y(r,n,e,t,o){return K(r,n,null,0,e,t,o)}function L(r,n,e,t,o){var i=new Uint8Array(32);return x(i,t,o,d),Y(r,n,e,t.subarray(16),i)}function T(r,n,e,t,o,i,a){var f=new Uint8Array(32);return x(f,i,a,d),K(r,n,e,t,o,i.subarray(16),f)}function k(r,n){var e,t=0;for(e=0;e<17;e++)t=t+(r[e]+n[e]|0)|0,r[e]=255&t,t>>>=8}var z=new Uint32Array([5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,252]);function R(r,n,e,t,o,i){var a,f,u,c,w=new Uint32Array(17),y=new Uint32Array(17),l=new Uint32Array(17),s=new Uint32Array(17),h=new Uint32Array(17);for(u=0;u<17;u++)y[u]=l[u]=0;for(u=0;u<16;u++)y[u]=i[u];for(y[3]&=15,y[4]&=252,y[7]&=15,y[8]&=252,y[11]&=15,y[12]&=252,y[15]&=15;0<o;){for(u=0;u<17;u++)s[u]=0;for(u=0;u<16&&u<o;++u)s[u]=e[t+u];for(s[u]=1,t+=u,o-=u,k(l,s),f=0;f<17;f++)for(u=w[f]=0;u<17;u++)w[f]=w[f]+l[u]*(u<=f?y[f-u]:320*y[f+17-u]|0)|0;for(f=0;f<17;f++)l[f]=w[f];for(u=c=0;u<16;u++)c=c+l[u]|0,l[u]=255&c,c>>>=8;for(c=c+l[16]|0,l[16]=3&c,c=5*(c>>>2)|0,u=0;u<16;u++)c=c+l[u]|0,l[u]=255&c,c>>>=8;c=c+l[16]|0,l[16]=c}for(u=0;u<17;u++)h[u]=l[u];for(k(l,z),a=0|-(l[16]>>>7),u=0;u<17;u++)l[u]^=a&(h[u]^l[u]);for(u=0;u<16;u++)s[u]=i[u+16];for(s[16]=0,k(l,s),u=0;u<16;u++)r[n+u]=l[u];return 0}function P(r,n,e,t,o,i){var a=new Uint8Array(16);return R(a,0,e,t,o,i),A(r,n,a,0)}function M(r,n,e,t,o){var i;if(e<32)return-1;for(T(r,0,n,0,e,t,o),R(r,16,r,32,e-32,r),i=0;i<16;i++)r[i]=0;return 0}function N(r,n,e,t,o){var i,a=new Uint8Array(32);if(e<32)return-1;if(L(a,0,32,t,o),0!==P(n,16,n,32,e-32,a))return-1;for(T(r,0,n,0,e,t,o),i=0;i<32;i++)r[i]=0;return 0}function O(r,n){var e;for(e=0;e<16;e++)r[e]=0|n[e]}function C(r){var n,e;for(e=0;e<16;e++)r[e]+=65536,n=Math.floor(r[e]/65536),r[(e+1)*(e<15?1:0)]+=n-1+37*(n-1)*(15===e?1:0),r[e]-=65536*n}function F(r,n,e){for(var t,o=~(e-1),i=0;i<16;i++)t=o&(r[i]^n[i]),r[i]^=t,n[i]^=t}function Z(r,n){var e,t,o,i=v(),a=v();for(e=0;e<16;e++)a[e]=n[e];for(C(a),C(a),C(a),t=0;t<2;t++){for(i[0]=a[0]-65517,e=1;e<15;e++)i[e]=a[e]-65535-(i[e-1]>>16&1),i[e-1]&=65535;i[15]=a[15]-32767-(i[14]>>16&1),o=i[15]>>16&1,i[14]&=65535,F(a,i,1-o)}for(e=0;e<16;e++)r[2*e]=255&a[e],r[2*e+1]=a[e]>>8}function G(r,n){var e=new Uint8Array(32),t=new Uint8Array(32);return Z(e,r),Z(t,n),_(e,0,t,0)}function q(r){var n=new Uint8Array(32);return Z(n,r),1&n[0]}function D(r,n){var e;for(e=0;e<16;e++)r[e]=n[2*e]+(n[2*e+1]<<8);r[15]&=32767}function I(r,n,e){var t;for(t=0;t<16;t++)r[t]=n[t]+e[t]|0}function V(r,n,e){var t;for(t=0;t<16;t++)r[t]=n[t]-e[t]|0}function X(r,n,e){var t,o,i=new Float64Array(31);for(t=0;t<31;t++)i[t]=0;for(t=0;t<16;t++)for(o=0;o<16;o++)i[t+o]+=n[t]*e[o];for(t=0;t<15;t++)i[t]+=38*i[t+16];for(t=0;t<16;t++)r[t]=i[t];C(r),C(r)}function j(r,n){X(r,n,n)}function H(r,n){var e,t=v();for(e=0;e<16;e++)t[e]=n[e];for(e=253;0<=e;e--)j(t,t),2!==e&&4!==e&&X(t,t,n);for(e=0;e<16;e++)r[e]=t[e]}function J(r,n){var e,t=v();for(e=0;e<16;e++)t[e]=n[e];for(e=250;0<=e;e--)j(t,t),1!==e&&X(t,t,n);for(e=0;e<16;e++)r[e]=t[e]}function Q(r,n,e){var t,o,i=new Uint8Array(32),a=new Float64Array(80),f=v(),u=v(),c=v(),w=v(),y=v(),l=v();for(o=0;o<31;o++)i[o]=n[o];for(i[31]=127&n[31]|64,i[0]&=248,D(a,e),o=0;o<16;o++)u[o]=a[o],w[o]=f[o]=c[o]=0;for(f[0]=w[0]=1,o=254;0<=o;--o)F(f,u,t=i[o>>>3]>>>(7&o)&1),F(c,w,t),I(y,f,c),V(f,f,c),I(c,u,w),V(u,u,w),j(w,y),j(l,f),X(f,c,f),X(c,u,y),I(y,f,c),V(f,f,c),j(u,f),V(c,w,l),X(f,c,g),I(f,f,w),X(c,c,f),X(f,w,l),X(w,u,a),j(u,y),F(f,u,t),F(c,w,t);for(o=0;o<16;o++)a[o+16]=f[o],a[o+32]=c[o],a[o+48]=u[o],a[o+64]=w[o];var s=a.subarray(32),h=a.subarray(16);return H(s,s),X(h,h,s),Z(r,h),0}function W(r,n){return Q(r,n,e)}function $(r,n){return a(n,32),W(r,n)}function rr(r,n,e){var t=new Uint8Array(32);return Q(t,e,n),x(r,o,t,d)}var nr=M,er=N;function tr(){var r,n,e,t=0,o=0,i=0,a=0,f=65535;for(e=0;e<arguments.length;e++)t+=(r=arguments[e].lo)&f,o+=r>>>16,i+=(n=arguments[e].hi)&f,a+=n>>>16;return new m((i+=(o+=t>>>16)>>>16)&f|(a+=i>>>16)<<16,t&f|o<<16)}function or(r,n){return new m(r.hi>>>n,r.lo>>>n|r.hi<<32-n)}function ir(){var r,n=0,e=0;for(r=0;r<arguments.length;r++)n^=arguments[r].lo,e^=arguments[r].hi;return new m(e,n)}function ar(r,n){var e,t,o=32-n;return n<32?(e=r.hi>>>n|r.lo<<o,t=r.lo>>>n|r.hi<<o):n<64&&(e=r.lo>>>n|r.hi<<o,t=r.hi>>>n|r.lo<<o),new m(e,t)}var fr=[new m(1116352408,3609767458),new m(1899447441,602891725),new m(3049323471,3964484399),new m(3921009573,2173295548),new m(961987163,4081628472),new m(1508970993,3053834265),new m(2453635748,2937671579),new m(2870763221,3664609560),new m(3624381080,2734883394),new m(310598401,1164996542),new m(607225278,1323610764),new m(1426881987,3590304994),new m(1925078388,4068182383),new m(2162078206,991336113),new m(2614888103,633803317),new m(3248222580,3479774868),new m(3835390401,2666613458),new m(4022224774,944711139),new m(264347078,2341262773),new m(604807628,2007800933),new m(770255983,1495990901),new m(1249150122,1856431235),new m(1555081692,3175218132),new m(1996064986,2198950837),new m(2554220882,3999719339),new m(2821834349,766784016),new m(2952996808,2566594879),new m(3210313671,3203337956),new m(3336571891,1034457026),new m(3584528711,2466948901),new m(113926993,3758326383),new m(338241895,168717936),new m(666307205,1188179964),new m(773529912,1546045734),new m(1294757372,1522805485),new m(1396182291,2643833823),new m(1695183700,2343527390),new m(1986661051,1014477480),new m(2177026350,1206759142),new m(2456956037,344077627),new m(2730485921,1290863460),new m(2820302411,3158454273),new m(3259730800,3505952657),new m(3345764771,106217008),new m(3516065817,3606008344),new m(3600352804,1432725776),new m(4094571909,1467031594),new m(275423344,851169720),new m(430227734,3100823752),new m(506948616,1363258195),new m(659060556,3750685593),new m(883997877,3785050280),new m(958139571,3318307427),new m(1322822218,3812723403),new m(1537002063,2003034995),new m(1747873779,3602036899),new m(1955562222,1575990012),new m(2024104815,1125592928),new m(2227730452,2716904306),new m(2361852424,442776044),new m(2428436474,593698344),new m(2756734187,3733110249),new m(3204031479,2999351573),new m(3329325298,3815920427),new m(3391569614,3928383900),new m(3515267271,566280711),new m(3940187606,3454069534),new m(4118630271,4000239992),new m(116418474,1914138554),new m(174292421,2731055270),new m(289380356,3203993006),new m(460393269,320620315),new m(685471733,587496836),new m(852142971,1086792851),new m(1017036298,365543100),new m(1126000580,2618297676),new m(1288033470,3409855158),new m(1501505948,4234509866),new m(1607167915,987167468),new m(1816402316,1246189591)];function ur(r,n,e){var t,o,i,a=[],f=[],u=[],c=[];for(o=0;o<8;o++)a[o]=u[o]=B(r,8*o);for(var w,y,l,s,h,v,g,b,p,A,_,U,E,x,d=0;128<=e;){for(o=0;o<16;o++)c[o]=B(n,8*o+d);for(o=0;o<80;o++){for(i=0;i<8;i++)f[i]=u[i];for(t=tr(u[7],ir(ar(x=u[4],14),ar(x,18),ar(x,41)),(p=u[4],A=u[5],_=u[6],0,U=p.hi&A.hi^~p.hi&_.hi,E=p.lo&A.lo^~p.lo&_.lo,new m(U,E)),fr[o],c[o%16]),f[7]=tr(t,ir(ar(b=u[0],28),ar(b,34),ar(b,39)),(l=u[0],s=u[1],h=u[2],0,v=l.hi&s.hi^l.hi&h.hi^s.hi&h.hi,g=l.lo&s.lo^l.lo&h.lo^s.lo&h.lo,new m(v,g))),f[3]=tr(f[3],t),i=0;i<8;i++)u[(i+1)%8]=f[i];if(o%16==15)for(i=0;i<16;i++)c[i]=tr(c[i],c[(i+9)%16],ir(ar(y=c[(i+1)%16],1),ar(y,8),or(y,7)),ir(ar(w=c[(i+14)%16],19),ar(w,61),or(w,6)))}for(o=0;o<8;o++)u[o]=tr(u[o],a[o]),a[o]=u[o];d+=128,e-=128}for(o=0;o<8;o++)S(r,8*o,a[o]);return e}var cr=new Uint8Array([106,9,230,103,243,188,201,8,187,103,174,133,132,202,167,59,60,110,243,114,254,148,248,43,165,79,245,58,95,29,54,241,81,14,82,127,173,230,130,209,155,5,104,140,43,62,108,31,31,131,217,171,251,65,189,107,91,224,205,25,19,126,33,121]);function wr(r,n,e){var t,o=new Uint8Array(64),i=new Uint8Array(256),a=e;for(t=0;t<64;t++)o[t]=cr[t];for(ur(o,n,e),e%=128,t=0;t<256;t++)i[t]=0;for(t=0;t<e;t++)i[t]=n[a-e+t];for(i[e]=128,i[(e=256-128*(e<112?1:0))-9]=0,S(i,e-8,new m(a/536870912|0,a<<3)),ur(o,i,e),t=0;t<64;t++)r[t]=o[t];return 0}function yr(r,n){var e=v(),t=v(),o=v(),i=v(),a=v(),f=v(),u=v(),c=v(),w=v();V(e,r[1],r[0]),V(w,n[1],n[0]),X(e,e,w),I(t,r[0],r[1]),I(w,n[0],n[1]),X(t,t,w),X(o,r[3],n[3]),X(o,o,l),X(i,r[2],n[2]),I(i,i,i),V(a,t,e),V(f,i,o),I(u,i,o),I(c,t,e),X(r[0],a,f),X(r[1],c,u),X(r[2],u,f),X(r[3],a,c)}function lr(r,n,e){var t;for(t=0;t<4;t++)F(r[t],n[t],e)}function sr(r,n){var e=v(),t=v(),o=v();H(o,n[2]),X(e,n[0],o),X(t,n[1],o),Z(r,t),r[31]^=q(e)<<7}function hr(r,n,e){var t,o;for(O(r[0],c),O(r[1],w),O(r[2],w),O(r[3],c),o=255;0<=o;--o)lr(r,n,t=e[o/8|0]>>(7&o)&1),yr(n,r),yr(r,r),lr(r,n,t)}function vr(r,n){var e=[v(),v(),v(),v()];O(e[0],t),O(e[1],f),O(e[2],w),X(e[3],t,f),hr(r,e,n)}function gr(r,n,e){var t,o=new Uint8Array(64),i=[v(),v(),v(),v()];for(e||a(n,32),wr(o,n,32),o[0]&=248,o[31]&=127,o[31]|=64,vr(i,o),sr(r,i),t=0;t<32;t++)n[t+32]=r[t];return 0}var br=new Float64Array([237,211,245,92,26,99,18,88,214,156,247,162,222,249,222,20,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16]);function pr(r,n){var e,t,o,i;for(t=63;32<=t;--t){for(e=0,o=t-32,i=t-12;o<i;++o)n[o]+=e-16*n[t]*br[o-(t-32)],e=Math.floor((n[o]+128)/256),n[o]-=256*e;n[o]+=e,n[t]=0}for(o=e=0;o<32;o++)n[o]+=e-(n[31]>>4)*br[o],e=n[o]>>8,n[o]&=255;for(o=0;o<32;o++)n[o]-=e*br[o];for(t=0;t<32;t++)n[t+1]+=n[t]>>8,r[t]=255&n[t]}function Ar(r){var n,e=new Float64Array(64);for(n=0;n<64;n++)e[n]=r[n];for(n=0;n<64;n++)r[n]=0;pr(r,e)}function _r(r,n,e,t){var o,i,a=new Uint8Array(64),f=new Uint8Array(64),u=new Uint8Array(64),c=new Float64Array(64),w=[v(),v(),v(),v()];wr(a,t,32),a[0]&=248,a[31]&=127,a[31]|=64;var y=e+64;for(o=0;o<e;o++)r[64+o]=n[o];for(o=0;o<32;o++)r[32+o]=a[32+o];for(wr(u,r.subarray(32),e+32),Ar(u),vr(w,u),sr(r,w),o=32;o<64;o++)r[o]=t[o];for(wr(f,r,e+64),Ar(f),o=0;o<64;o++)c[o]=0;for(o=0;o<32;o++)c[o]=u[o];for(o=0;o<32;o++)for(i=0;i<32;i++)c[o+i]+=f[o]*a[i];return pr(r.subarray(32),c),y}function Ur(r,n,e,t){var o,i=new Uint8Array(32),a=new Uint8Array(64),f=[v(),v(),v(),v()],u=[v(),v(),v(),v()];if(e<64)return-1;if(function(r,n){var e=v(),t=v(),o=v(),i=v(),a=v(),f=v(),u=v();if(O(r[2],w),D(r[1],n),j(o,r[1]),X(i,o,y),V(o,o,r[2]),I(i,r[2],i),j(a,i),j(f,a),X(u,f,a),X(e,u,o),X(e,e,i),J(e,e),X(e,e,o),X(e,e,i),X(e,e,i),X(r[0],e,i),j(t,r[0]),X(t,t,i),G(t,o)&&X(r[0],r[0],s),j(t,r[0]),X(t,t,i),G(t,o))return 1;q(r[0])===n[31]>>7&&V(r[0],c,r[0]),X(r[3],r[0],r[1])}(u,t))return-1;for(o=0;o<e;o++)r[o]=n[o];for(o=0;o<32;o++)r[o+32]=t[o];if(wr(a,r,e),Ar(a),hr(f,u,a),vr(u,n.subarray(32)),yr(f,u),sr(i,f),e-=64,_(n,0,i,0)){for(o=0;o<e;o++)r[o]=0;return-1}for(o=0;o<e;o++)r[o]=n[o+64];return e}function Er(r,n){if(32!==r.length)throw new Error("bad key size");if(24!==n.length)throw new Error("bad nonce size")}function xr(){for(var r=0;r<arguments.length;r++)if(!(arguments[r]instanceof Uint8Array))throw new TypeError("unexpected type, use Uint8Array")}function dr(r){for(var n=0;n<r.length;n++)r[n]=0}i.lowlevel={crypto_core_hsalsa20:x,crypto_stream_xor:T,crypto_stream:L,crypto_stream_salsa20_xor:K,crypto_stream_salsa20:Y,crypto_onetimeauth:R,crypto_onetimeauth_verify:P,crypto_verify_16:A,crypto_verify_32:_,crypto_secretbox:M,crypto_secretbox_open:N,crypto_scalarmult:Q,crypto_scalarmult_base:W,crypto_box_beforenm:rr,crypto_box_afternm:nr,crypto_box:function(r,n,e,t,o,i){var a=new Uint8Array(32);return rr(a,o,i),nr(r,n,e,t,a)},crypto_box_open:function(r,n,e,t,o,i){var a=new Uint8Array(32);return rr(a,o,i),er(r,n,e,t,a)},crypto_box_keypair:$,crypto_hash:wr,crypto_sign:_r,crypto_sign_keypair:gr,crypto_sign_open:Ur,crypto_secretbox_KEYBYTES:32,crypto_secretbox_NONCEBYTES:24,crypto_secretbox_ZEROBYTES:32,crypto_secretbox_BOXZEROBYTES:16,crypto_scalarmult_BYTES:32,crypto_scalarmult_SCALARBYTES:32,crypto_box_PUBLICKEYBYTES:32,crypto_box_SECRETKEYBYTES:32,crypto_box_BEFORENMBYTES:32,crypto_box_NONCEBYTES:24,crypto_box_ZEROBYTES:32,crypto_box_BOXZEROBYTES:16,crypto_sign_BYTES:64,crypto_sign_PUBLICKEYBYTES:32,crypto_sign_SECRETKEYBYTES:64,crypto_sign_SEEDBYTES:32,crypto_hash_BYTES:64,gf:v,D:y,L:br,pack25519:Z,unpack25519:D,M:X,A:I,S:j,Z:V,pow2523:J,add:yr,set25519:O,modL:pr,scalarmult:hr,scalarbase:vr},i.randomBytes=function(r){var n=new Uint8Array(r);return a(n,r),n},i.secretbox=function(r,n,e){xr(r,n,e),Er(e,n);for(var t=new Uint8Array(32+r.length),o=new Uint8Array(t.length),i=0;i<r.length;i++)t[i+32]=r[i];return M(o,t,t.length,n,e),o.subarray(16)},i.secretbox.open=function(r,n,e){xr(r,n,e),Er(e,n);for(var t=new Uint8Array(16+r.length),o=new Uint8Array(t.length),i=0;i<r.length;i++)t[i+16]=r[i];return t.length<32||0!==N(o,t,t.length,n,e)?null:o.subarray(32)},i.secretbox.keyLength=32,i.secretbox.nonceLength=24,i.secretbox.overheadLength=16,i.scalarMult=function(r,n){if(xr(r,n),32!==r.length)throw new Error("bad n size");if(32!==n.length)throw new Error("bad p size");var e=new Uint8Array(32);return Q(e,r,n),e},i.scalarMult.base=function(r){if(xr(r),32!==r.length)throw new Error("bad n size");var n=new Uint8Array(32);return W(n,r),n},i.scalarMult.scalarLength=32,i.scalarMult.groupElementLength=32,i.box=function(r,n,e,t){var o=i.box.before(e,t);return i.secretbox(r,n,o)},i.box.before=function(r,n){xr(r,n),function(r,n){if(32!==r.length)throw new Error("bad public key size");if(32!==n.length)throw new Error("bad secret key size")}(r,n);var e=new Uint8Array(32);return rr(e,r,n),e},i.box.after=i.secretbox,i.box.open=function(r,n,e,t){var o=i.box.before(e,t);return i.secretbox.open(r,n,o)},i.box.open.after=i.secretbox.open,i.box.keyPair=function(){var r=new Uint8Array(32),n=new Uint8Array(32);return $(r,n),{publicKey:r,secretKey:n}},i.box.keyPair.fromSecretKey=function(r){if(xr(r),32!==r.length)throw new Error("bad secret key size");var n=new Uint8Array(32);return W(n,r),{publicKey:n,secretKey:new Uint8Array(r)}},i.box.publicKeyLength=32,i.box.secretKeyLength=32,i.box.sharedKeyLength=32,i.box.nonceLength=24,i.box.overheadLength=i.secretbox.overheadLength,i.sign=function(r,n){if(xr(r,n),64!==n.length)throw new Error("bad secret key size");var e=new Uint8Array(64+r.length);return _r(e,r,r.length,n),e},i.sign.open=function(r,n){if(xr(r,n),32!==n.length)throw new Error("bad public key size");var e=new Uint8Array(r.length),t=Ur(e,r,r.length,n);if(t<0)return null;for(var o=new Uint8Array(t),i=0;i<o.length;i++)o[i]=e[i];return o},i.sign.detached=function(r,n){for(var e=i.sign(r,n),t=new Uint8Array(64),o=0;o<t.length;o++)t[o]=e[o];return t},i.sign.detached.verify=function(r,n,e){if(xr(r,n,e),64!==n.length)throw new Error("bad signature size");if(32!==e.length)throw new Error("bad public key size");var t,o=new Uint8Array(64+r.length),i=new Uint8Array(64+r.length);for(t=0;t<64;t++)o[t]=n[t];for(t=0;t<r.length;t++)o[t+64]=r[t];return 0<=Ur(i,o,o.length,e)},i.sign.keyPair=function(){var r=new Uint8Array(32),n=new Uint8Array(64);return gr(r,n),{publicKey:r,secretKey:n}},i.sign.keyPair.fromSecretKey=function(r){if(xr(r),64!==r.length)throw new Error("bad secret key size");for(var n=new Uint8Array(32),e=0;e<n.length;e++)n[e]=r[32+e];return{publicKey:n,secretKey:new Uint8Array(r)}},i.sign.keyPair.fromSeed=function(r){if(xr(r),32!==r.length)throw new Error("bad seed size");for(var n=new Uint8Array(32),e=new Uint8Array(64),t=0;t<32;t++)e[t]=r[t];return gr(n,e,!0),{publicKey:n,secretKey:e}},i.sign.publicKeyLength=32,i.sign.secretKeyLength=64,i.sign.seedLength=32,i.sign.signatureLength=64,i.hash=function(r){xr(r);var n=new Uint8Array(64);return wr(n,r,r.length),n},i.hash.hashLength=64,i.verify=function(r,n){return xr(r,n),0!==r.length&&0!==n.length&&(r.length===n.length&&0===u(r,0,n,0,r.length))},i.setPRNG=function(r){a=r},function(){var o="undefined"!=typeof self?self.crypto||self.msCrypto:null;if(o&&o.getRandomValues){i.setPRNG(function(r,n){var e,t=new Uint8Array(n);for(e=0;e<n;e+=65536)o.getRandomValues(t.subarray(e,e+Math.min(n-e,65536)));for(e=0;e<n;e++)r[e]=t[e];dr(t)})}else"undefined"!=typeof require&&(o=require("crypto"))&&o.randomBytes&&i.setPRNG(function(r,n){var e,t=o.randomBytes(n);for(e=0;e<n;e++)r[e]=t[e];dr(t)})}()}("undefined"!=typeof module&&module.exports?module.exports:self.nacl=self.nacl||{});
  return module.exports; })();
  /* secretbox above: TweetNaCl-js, public domain (Unlicense). */
  // ---------------------------------------------------------------------------
  // SDA Controls: the session actions of the desktop app's toolbar for the web
  // client (Ctrl+Alt+Del, lock, restart, block input, privacy mode, monitors,
  // refresh, type text) plus full-screen and view-size controls.
  // Uses the existing bridge (window.setByName / window.curConn). Messages the
  // bundled web encoder does not know (restart) are encoded here and sent
  // through the session's own encrypted channel, with the same nonce counter.
  // ---------------------------------------------------------------------------
  var VER = "20261115-ctl2";
  var stats = window.__sdaCtl = { ver: VER, sent: [] };

  function conn() { return window.curConn || null; }
  function bridgeReady() { return typeof window.setByName === "function" && !window.setByName.__sdaStub; }
  function inSession() {
    var c = conn();
    var sock = c && c._ws && c._ws._websocket;
    return !!(c && c._peerInfo && sock && sock.readyState === 1 && !c._userClosed);
  }
  function peerName() {
    var c = conn(), pi = c && c._peerInfo;
    return (pi && (pi.hostname || pi.username)) || (c && c._id) || "the remote computer";
  }
  function peerPlatform() {
    var c = conn(), pi = c && c._peerInfo;
    return (pi && pi.platform) || "";
  }
  function isIpadUi() {
    try { return typeof window.sdaIsIpad === "function" && window.sdaIsIpad(); } catch (e) { return false; }
  }
  function log(ev, why) {
    stats.sent.push(ev + (why ? ":" + why : ""));
    if (stats.sent.length > 50) stats.sent.shift();
  }

  function call(name, value) {
    if (!bridgeReady() || !conn()) { toast("Not connected"); return false; }
    try { window.setByName(name, value); log(name, value); return true; }
    catch (e) { toast("Could not send"); return false; }
  }

  // --- raw protobuf + encrypted send ---------------------------------------
  function varint(n, out) { while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); } out.push(n); }
  function field(num, wire, out) { varint(num * 8 + wire, out); }
  function lenField(num, bytes, out) { field(num, 2, out); varint(bytes.length, out); for (var i = 0; i < bytes.length; i++) out.push(bytes[i]); }
  // Message { misc (19) : Misc { <inner> } }
  function miscMessage(inner) { var out = []; lenField(19, inner, out); return new Uint8Array(out); }
  function makeNonce(value) {
    var b = new Uint8Array(24);
    for (var i = 0; i < 24 && value > 0; i++) { var byte = value & 255; b[i] = byte; value = (value - byte) / 256; }
    return b;
  }
  function sendRaw(plain, what) {
    var c = conn(), ws = c && c._ws, sock = ws && ws._websocket;
    if (!sock || sock.readyState !== 1) { toast("Not connected"); return false; }
    var data = plain;
    var k = ws._secretKey;
    if (k) {
      k[1] += 1;
      data = nacl.secretbox(plain, makeNonce(k[1]), k[0]);
    }
    sock.send(data);
    log("raw", what);
    return true;
  }
  window.sdaCtlEncode = { miscMessage: miscMessage, nonce: makeNonce, secretbox: function (m, n, k) { return nacl.secretbox(m, n, k); }, open: function (b, n, k) { return nacl.secretbox.open(b, n, k); } };

  // --- actions --------------------------------------------------------------
  var state = { block: false, privacy: false, connId: null };
  function syncConnState() {
    var c = conn();
    var id = c ? c._id + "|" + (c._peerInfo ? "1" : "0") : null;
    if (id !== state.connId) { state.connId = id; state.block = false; state.privacy = false; }
  }

  function actCad() { closePanel(); if (call("ctrl_alt_del", "")) toast("Ctrl+Alt+Del sent"); }
  function actLock() { closePanel(); if (call("lock_screen", "")) toast("Lock screen sent"); }
  function actRefresh() { closePanel(); if (call("refresh", "")) toast("Screen refreshed"); }
  function actRestart() {
    confirmBox("Restart " + peerName() + "?",
      "The remote computer restarts right away. Unsaved work on it will be lost and this connection will drop. Reconnect in 1–2 minutes.",
      "Restart now", function () {
        // Misc.restart_remote_device (field 14) = true
        if (sendRaw(miscMessage([0x70, 0x01]), "restart_remote_device")) toast("Restart sent to " + peerName());
      });
  }
  function actBlock() {
    var on = !state.block;
    if (call("toggle_option", on ? "block-input" : "unblock-input")) {
      state.block = on;
      toast(on ? "User input on the remote computer is blocked" : "User input unblocked");
    }
    render();
  }
  function actPrivacy() {
    var c = conn();
    if (!c) return;
    var on = !state.privacy;
    try {
      // toggleOption flips the stored value; make sure it flips the way we want
      // and never leave privacy mode saved for the next connection.
      c._options = c._options || {};
      if (on) delete c._options["privacy-mode"]; else c._options["privacy-mode"] = true;
    } catch (e) {}
    if (call("toggle_option", "privacy-mode")) {
      state.privacy = on;
      try { c.setOption("privacy-mode", undefined); } catch (e2) {}
      toast(on ? "Privacy mode on: the remote screen is hidden from people at that computer" : "Privacy mode off");
    }
    render();
  }
  function actDisplay(i) { closePanel(); if (call("switch_display", i)) toast("Switched to monitor " + (i + 1)); }
  function actType() {
    textBox(function (text) {
      if (!text) return;
      var c = conn();
      if (!c || typeof c.inputString !== "function") { toast("Not connected"); return; }
      c.inputString(text);
      log("input_string", String(text.length));
      toast("Typed " + text.length + " character" + (text.length === 1 ? "" : "s"));
    });
  }
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function actFullscreen() {
    if (isFull()) { if (window.sdaExitFullscreen) window.sdaExitFullscreen(); }
    else if (window.sdaRequestFullscreen) window.sdaRequestFullscreen();
    setTimeout(render, 400);
  }
  function actView(mode) { if (window.sdaSetViewMode) window.sdaSetViewMode(mode); render(); }
  function actZoom(f) { if (window.sdaZoomBy) window.sdaZoomBy(f); render(); }
  function actWindow() {
    var vs = window.sdaGetViewState ? window.sdaGetViewState() : null;
    if (window.sdaSetWindowView && vs) window.sdaSetWindowView(!vs.windowView);
    render();
  }

  // --- UI ---------------------------------------------------------------------
  var CSS = [
    "#sda-ctl-dbar #sda-ctl-fab{background:linear-gradient(135deg,#6d28d9,#2563eb);}",
    "#sda-ctl-btn{background:linear-gradient(135deg,#6d28d9,#2563eb)!important;color:#fff!important;}",
    "#sda-add-btn,#sda-sess-btn{background:#4338ca!important;color:#fff!important;} #sda-disc-btn{background:#fff!important;color:#be123c!important;}",
    "#sda-ctl-dbar{position:fixed;left:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:2147483100;display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100vw - 260px);}",
    "#sda-ctl-dbar button{height:40px;padding:0 16px;border:0;border-radius:20px;background:#4338ca;color:#fff;font:650 14px/40px system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 2px 10px rgba(30,27,75,.35);cursor:pointer;-webkit-tap-highlight-color:transparent;}",
    "#sda-ctl-dbar #sda-disc-btn2{background:#fff;color:#be123c;}",
    ".sda-ctl-pc{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:0 0 8px;border-radius:12px;background:#eef2ff;border:1px solid #c7d2fe;color:#1e1b4b;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;}",
    ".sda-ctl-pc.off{opacity:.6;cursor:default;} .sda-ctl-pc:not(.off):active{background:#ddd6fe;}",
    ".sda-ctl-dot{width:14px;height:14px;border-radius:50%;flex:0 0 14px;} .sda-ctl-pctext{display:flex;flex-direction:column;min-width:0;flex:1;} .sda-ctl-pctext b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .sda-ctl-pctext small{color:#64748b;font-size:12px;}",
    ".sda-ctl-b.small{min-height:36px;min-width:0;padding:6px 12px;}",
    "#sda-cad-btn{background:#4c1d95!important;color:#fff!important;}",
    "#sda-ctl-panel{position:fixed;z-index:2147483300;left:50%;top:50%;transform:translate(-50%,-50%);width:min(460px,calc(100vw - 24px));max-height:calc(100vh - 40px);overflow:auto;-webkit-overflow-scrolling:touch;background:#fff;color:#1e1b4b;border-radius:18px;box-shadow:0 18px 50px rgba(30,27,75,.45);font:15px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif;}",
    "#sda-ctl-panel *{box-sizing:border-box;}",
    "#sda-ctl-shade{position:fixed;inset:0;z-index:2147483250;background:rgba(15,23,42,.45);}",
    ".sda-ctl-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:linear-gradient(135deg,#6d28d9,#2563eb);color:#fff;border-radius:18px 18px 0 0;position:sticky;top:0;}",
    ".sda-ctl-head b{font-size:16px;} .sda-ctl-head small{display:block;opacity:.85;font-size:12px;font-weight:500;}",
    ".sda-ctl-x{width:40px;height:40px;border:0;border-radius:20px;background:rgba(255,255,255,.18);color:#fff;font-size:22px;line-height:40px;cursor:pointer;}",
    ".sda-ctl-sec{padding:10px 14px 4px;} .sda-ctl-sec h4{margin:4px 2px 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6d28d9;}",
    ".sda-ctl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;} .sda-ctl-grid.g3{grid-template-columns:repeat(3,1fr);} .sda-ctl-grid.g4{grid-template-columns:repeat(4,1fr);}",
    ".sda-ctl-b{min-height:46px;padding:8px 10px;border:1px solid #c7d2fe;border-radius:12px;background:#eef2ff;color:#1e1b4b;font:600 14px/1.2 inherit;font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;text-align:center;}",
    ".sda-ctl-b:active{background:#ddd6fe;} .sda-ctl-b[aria-pressed=true]{background:linear-gradient(135deg,#6d28d9,#2563eb);color:#fff;border-color:transparent;}",
    ".sda-ctl-b.danger{background:#fff1f2;border-color:#fecdd3;color:#9f1239;}",
    ".sda-ctl-note{margin:6px 2px 8px;font-size:12px;color:#475569;}",
    "#sda-ctl-toast{position:fixed;left:50%;bottom:calc(64px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483400;max-width:calc(100vw - 32px);padding:10px 16px;border-radius:12px;background:#1e1b4b;color:#fff;font:600 14px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);pointer-events:none;}",
    ".sda-ctl-dlg{padding:16px;} .sda-ctl-dlg p{margin:0 0 14px;color:#334155;} .sda-ctl-dlg textarea{width:100%;min-height:120px;padding:10px;border:1px solid #c7d2fe;border-radius:10px;font:15px/1.4 system-ui,sans-serif;color:#0f172a;}",
    ".sda-ctl-row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;} .sda-ctl-row .sda-ctl-b{min-width:110px;}",
    ".sda-ctl-b.primary{background:linear-gradient(135deg,#6d28d9,#2563eb);color:#fff;border-color:transparent;} .sda-ctl-b.red{background:#be123c;color:#fff;border-color:transparent;}"
  ].join("");
  function ensureStyle() {
    if (document.getElementById("sda-ctl-style") || !document.head) return;
    var st = document.createElement("style");
    st.id = "sda-ctl-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === "cls") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    return e;
  }
  function stop(ev) { try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {} }
  function btn(label, id, fn, extra) {
    var b = el("button", { type: "button", cls: "sda-ctl-b" + (extra && extra.cls ? " " + extra.cls : ""), "data-act": id }, label);
    if (extra && extra.pressed != null) b.setAttribute("aria-pressed", extra.pressed ? "true" : "false");
    if (extra && extra.title) b.title = extra.title;
    b.addEventListener("click", function (ev) { stop(ev); fn(); });
    return b;
  }

  var toastTimer = null;
  function toast(msg) {
    ensureStyle();
    var t = document.getElementById("sda-ctl-toast");
    if (!t) { t = el("div", { id: "sda-ctl-toast", role: "status" }); document.body.appendChild(t); }
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = "none"; }, 2600);
  }

  // Keys typed inside our panel/dialogs must never reach the remote computer
  // (Flutter and the session key listeners read keys at window level).
  function isOurs(t) { return !!(t && t.closest && t.closest("#sda-ctl-panel")); }
  ["keydown", "keyup", "keypress", "beforeinput", "input", "compositionstart", "compositionend"].forEach(function (type) {
    window.addEventListener(type, function (ev) {
      if (panelOpen || isOurs(ev.target)) {
        ev.stopImmediatePropagation();
        if (ev.type === "keydown" && ev.key === "Escape") closePanel();
      }
    }, true);
  });

  var POINTER_EVENTS = ["pointerdown", "pointermove", "pointerup", "pointercancel", "touchstart", "touchmove", "touchend", "touchcancel", "mousedown", "mousemove", "mouseup", "wheel", "contextmenu"];
  var panelOpen = false;
  function closePanel() {
    panelOpen = false;
    ["sda-ctl-panel", "sda-ctl-shade"].forEach(function (id) {
      var e = document.getElementById(id);
      if (e && e.parentNode) e.parentNode.removeChild(e);
    });
  }
  function shell(title, sub) {
    closePanel();
    ensureStyle();
    panelOpen = true;
    var shade = el("div", { id: "sda-ctl-shade" });
    shade.addEventListener("click", function (ev) { stop(ev); closePanel(); });
    POINTER_EVENTS.forEach(function (t) { shade.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true }); });
    var p = el("div", { id: "sda-ctl-panel", role: "dialog", "aria-label": title });
    POINTER_EVENTS.forEach(function (t) { p.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true }); });
    var head = el("div", { cls: "sda-ctl-head" });
    var h = el("div");
    h.appendChild(el("b", null, title));
    if (sub) h.appendChild(el("small", null, sub));
    var x = el("button", { type: "button", cls: "sda-ctl-x", "aria-label": "Close" }, "×");
    x.addEventListener("click", function (ev) { stop(ev); closePanel(); });
    head.appendChild(h); head.appendChild(x);
    p.appendChild(head);
    document.body.appendChild(shade);
    document.body.appendChild(p);
    return p;
  }
  function section(p, title, cls) {
    var s = el("div", { cls: "sda-ctl-sec" });
    if (title) s.appendChild(el("h4", null, title));
    var g = el("div", { cls: "sda-ctl-grid" + (cls ? " " + cls : "") });
    s.appendChild(g);
    p.appendChild(s);
    return { s: s, g: g };
  }

  function render() {
    if (!panelOpen || !document.getElementById("sda-ctl-panel") || document.getElementById("sda-ctl-panel").getAttribute("data-kind") !== "menu") return;
    openMenu(true);
  }

  function openMenu(keepScroll) {
    syncConnState();
    var old = document.getElementById("sda-ctl-panel");
    var scroll = keepScroll && old ? old.scrollTop : 0;
    var plat = peerPlatform();
    var p = shell("Remote controls", peerName() + (plat ? " · " + plat : ""));
    p.setAttribute("data-kind", "menu");

    var ss = section(p, "Session", "g3");
    ss.g.appendChild(btn("+ Add computer", "add", actAddComputer, { cls: "primary", title: "Open another computer in a new tab; this one stays open" }));
    var nOpen = openSessions().length;
    ss.g.appendChild(btn("⇄ Sessions (" + nOpen + ")", "sessions", actSessions, { title: "Computers open in this browser" }));
    ss.g.appendChild(btn("Disconnect", "disconnect", actDisconnect, { cls: "danger" }));

    var a = section(p, "Keys and power");
    a.g.appendChild(btn("Ctrl + Alt + Del", "cad", actCad, { title: "Send Ctrl+Alt+Del (Windows sign-in / security screen)" }));
    a.g.appendChild(btn("Lock screen", "lock", actLock));
    a.g.appendChild(btn("Refresh screen", "refresh", actRefresh));
    a.g.appendChild(btn("Restart computer…", "restart", actRestart, { cls: "danger" }));

    var b = section(p, "Remote input");
    b.g.appendChild(btn(state.block ? "Unblock user input" : "Block user input", "block", actBlock, { pressed: state.block, title: "Stop the mouse and keyboard at the remote computer while you work" }));
    if (/windows/i.test(plat) || !plat) b.g.appendChild(btn(state.privacy ? "Privacy mode: on" : "Privacy mode: off", "privacy", actPrivacy, { pressed: state.privacy, title: "Hide the remote screen from people sitting at that computer" }));
    b.g.appendChild(btn("Type text / paste…", "type", actType, { title: "Type text, or text from your clipboard, into the remote computer" }));

    var c = conn(), pi = c && c._peerInfo;
    var displays = (pi && pi.displays) || [];
    if (displays.length > 1) {
      var d = section(p, "Monitor", displays.length > 3 ? "g4" : "g3");
      var cur = pi.current_display || 0;
      displays.forEach(function (dsp, i) {
        d.g.appendChild(btn("Monitor " + (i + 1), "display" + i, function () { actDisplay(i); pi.current_display = i; render(); }, { pressed: i === cur, title: dsp.width + "×" + dsp.height }));
      });
    }

    var v = section(p, "Screen size", "g3");
    v.g.appendChild(btn(isFull() ? "Exit full screen" : "Full screen", "fullscreen", actFullscreen, { pressed: isFull() }));
    var vs = window.sdaGetViewState ? window.sdaGetViewState() : null;
    if (isIpadUi() && vs) {
      v.g.appendChild(btn(vs.windowView ? "Restore view" : "Window view", "window", actWindow, { pressed: vs.windowView, title: vs.windowView ? "Show the remote screen full size again" : "Shrink the remote screen into a smaller window" }));
      v.g.appendChild(btn("Zoom in", "zoomin", function () { actZoom(1.25); }));
      v.g.appendChild(btn("Fit to screen", "fit", function () { actView("fit"); }, { pressed: vs.mode === "fit" && vs.scale <= 1.001 }));
      v.g.appendChild(btn("Original 100%", "original", function () { actView("original"); }, { pressed: vs.mode === "original" }));
      v.g.appendChild(btn("Stretch", "stretch", function () { actView("stretch"); }, { pressed: vs.mode === "stretch" }));
      v.g.appendChild(btn("Zoom out", "zoomout", function () { actZoom(0.8); }));
      v.s.appendChild(el("p", { cls: "sda-ctl-note" }, "Zoom: " + Math.round((vs.scale || 1) * 100) + "% of " + ({ fit: "fit", original: "original size", stretch: "stretch" })[vs.mode] + ". Pinch with two fingers to zoom, drag with two fingers to move around."));
    } else {
      v.s.appendChild(el("p", { cls: "sda-ctl-note" }, "Original / Shrink / Stretch: tap the arrow at the bottom right, then the screen icon. Leave full screen to get the normal browser window back."));
    }
    var pnl = document.getElementById("sda-ctl-panel");
    if (pnl && scroll) pnl.scrollTop = scroll;
  }

  function confirmBox(title, text, okLabel, onOk, okCls) {
    var p = shell(title);
    p.setAttribute("data-kind", "confirm");
    var d = el("div", { cls: "sda-ctl-dlg" });
    d.appendChild(el("p", null, text));
    var row = el("div", { cls: "sda-ctl-row" });
    row.appendChild(btn("Cancel", "cancel", function () { closePanel(); }));
    row.appendChild(btn(okLabel, "confirm", function () { closePanel(); onOk(); }, { cls: okCls || "red" }));
    d.appendChild(row);
    p.appendChild(d);
  }

  function textBox(onSend) {
    var p = shell("Type text on " + peerName());
    p.setAttribute("data-kind", "text");
    var d = el("div", { cls: "sda-ctl-dlg" });
    d.appendChild(el("p", null, "The text is typed into the window that is active on the remote computer."));
    var ta = el("textarea", { id: "sda-ctl-text", maxlength: "4000", autocapitalize: "off", autocomplete: "off", spellcheck: "false", placeholder: "Type or paste text here" });
    d.appendChild(ta);
    var row = el("div", { cls: "sda-ctl-row" });
    if (navigator.clipboard && navigator.clipboard.readText) {
      row.appendChild(btn("Paste my clipboard", "paste", function () {
        navigator.clipboard.readText().then(function (t) { ta.value = (t || "").slice(0, 4000); ta.focus(); })
          .catch(function () { toast("The browser did not allow reading the clipboard. Long-press the box and choose Paste."); ta.focus(); });
      }));
    }
    row.appendChild(btn("Cancel", "cancel", function () { closePanel(); }));
    row.appendChild(btn("Type it", "send", function () { var t = ta.value; closePanel(); onSend(t); }, { cls: "primary" }));
    d.appendChild(row);
    p.appendChild(d);
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 50);
  }

  function shieldPointer(node) {
    if (!node || node.__sdaShield) return;
    node.__sdaShield = true;
    POINTER_EVENTS.forEach(function (t) { node.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true }); });
  }
  function openFromButton(ev) { stop(ev); openMenu(false); }

  // --- open sessions across tabs (same browser) -------------------------------
  var TAB_UID = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var REG_KEY = "sda-open-sessions";
  var REG_TTL = 90000;
  function readReg() {
    var r = {};
    try { r = JSON.parse(localStorage.getItem(REG_KEY) || "{}") || {}; } catch (e) { r = {}; }
    var now = Date.now(), out = {};
    Object.keys(r).forEach(function (k) { var v = r[k]; if (v && v.id && now - (v.ts || 0) < REG_TTL) out[k] = v; });
    return out;
  }
  function writeReg(r) { try { localStorage.setItem(REG_KEY, JSON.stringify(r)); } catch (e) {} }
  function curId() { var c = conn(); return c && !c._userClosed && c._id ? String(c._id) : ""; }
  function heartbeat() {
    var r = readReg(), id = curId();
    if (id) r[TAB_UID] = { id: id, name: peerName(), ts: Date.now() };
    else delete r[TAB_UID];
    writeReg(r);
  }
  function dropSelf() { var r = readReg(); delete r[TAB_UID]; writeReg(r); }
  window.addEventListener("pagehide", dropSelf);
  window.addEventListener("beforeunload", dropSelf);
  function openSessions() {
    var r = readReg(), list = [];
    Object.keys(r).forEach(function (k) { list.push({ tab: k, id: r[k].id, name: r[k].name, mine: k === TAB_UID }); });
    var id = curId();
    if (id && !r[TAB_UID]) list.push({ tab: TAB_UID, id: id, name: peerName(), mine: true });
    list.sort(function (a, b) { return a.mine ? -1 : b.mine ? 1 : String(a.name).localeCompare(String(b.name)); });
    return list;
  }
  window.sdaOpenSessions = openSessions;
  var bc = null;
  try { bc = new BroadcastChannel("sda-tabs"); } catch (e) { bc = null; }
  function onTabMsg(m) {
    if (!m || m.to !== TAB_UID || m.type !== "focus") return;
    try { window.focus(); } catch (e) {}
    flashTitle();
  }
  if (bc) bc.onmessage = function (ev) { onTabMsg(ev.data); };
  window.addEventListener("storage", function (ev) {
    if (ev.key === "sda-tab-msg" && ev.newValue) { try { onTabMsg(JSON.parse(ev.newValue)); } catch (e) {} }
    if (ev.key === REG_KEY) updateBars();
  });
  function askFocus(tab) {
    var m = { to: tab, type: "focus", t: Date.now() };
    try { if (bc) bc.postMessage(m); } catch (e) {}
    try { localStorage.setItem("sda-tab-msg", JSON.stringify(m)); } catch (e2) {}
  }
  var baseTitle = null, flashT = null;
  function wantTitle() { return "SDA · " + peerName(); }
  function updateTitle() {
    if (curId() && inSession()) {
      if (baseTitle === null) baseTitle = document.title;
      if (!flashT && document.title !== wantTitle()) document.title = wantTitle();
    } else if (baseTitle !== null) { document.title = baseTitle; baseTitle = null; }
  }
  function flashTitle() {
    var n = 0;
    clearInterval(flashT);
    flashT = setInterval(function () {
      document.title = (n % 2 ? "" : "▶ ") + wantTitle();
      if (++n > 8) { clearInterval(flashT); flashT = null; updateTitle(); }
    }, 600);
  }

  // --- new tab opened from "+ Computer": connect once, like a list tap --------
  // The link is /webclient/#/?id=<ID>. The bundle's own ?id= auto-connect waits
  // for a Flutter callback that the home page never registers, so do the same
  // thing the computer list does (setByName("connect")), once, when ready.
  var LOAD_T = Date.now();
  var pendingOpen = null;
  try {
    var hm = (location.hash || "").match(/[?&]id=([^&]+)/);
    if (hm) {
      var hid = decodeURIComponent(hm[1]).trim();
      if (/^[A-Za-z0-9_-]{3,32}$/.test(hid)) pendingOpen = hid;
    }
  } catch (eH) {}
  function maybeOpenPending() {
    if (!pendingOpen) return;
    if (conn() || window.__sdaAutoConnectDone) { pendingOpen = null; return; }
    if (!bridgeReady() || Date.now() - LOAD_T < 1500) return;
    if (!document.querySelector("flt-glass-pane") && !document.querySelector("flutter-view")) return;
    if (!token()) { if (Date.now() - LOAD_T > 30000) pendingOpen = null; return; }
    if (!window.__sdaServerConfDone && Date.now() - LOAD_T < 10000) return;
    var id = pendingOpen;
    pendingOpen = null;
    window.__sdaAutoConnectDone = true;
    try {
      if (typeof window.sdaOpenComputer === "function") window.sdaOpenComputer(id);
      else window.setByName("connect", id);
      log("auto_open", id);
    } catch (e) {}
  }

  // --- disconnect -------------------------------------------------------------
  function doDisconnect() {
    closePanel();
    dropSelf();
    try { if (bridgeReady()) window.setByName("close", ""); log("close", ""); } catch (e) {}
    // Back to a clean computer list in this tab (no auto-connect id in the URL).
    setTimeout(function () {
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      try { location.reload(); } catch (e2) {}
    }, 250);
  }
  function actDisconnect() {
    confirmBox("Disconnect from " + peerName() + "?",
      "Only this connection is closed. Nothing changes on the remote computer.",
      "Disconnect", doDisconnect, "primary");
  }

  // --- add another computer (new tab) -----------------------------------------
  function token() { try { return localStorage.getItem("access_token") || ""; } catch (e) { return ""; } }
  function cleanName(n) { return String(n || "").replace(/\s*@(Online|Offline)\s*$/i, "").trim(); }
  function devName(d) { return cleanName(d.alias || d.hostname || d.id) || String(d.id); }
  function fetchDevices(cb) {
    var cached = [];
    try { cached = (window.sdaPeerStatus && window.sdaPeerStatus().devices) || []; } catch (e) {}
    var tok = token();
    if (!tok) { cb(cached, false); return; }
    fetch("/companion/api/v1/web-status", { method: "GET", headers: { Authorization: "Bearer " + tok }, credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("http"); return r.json(); })
      .then(function (data) {
        var list = ((data && data.devices) || []).map(function (row) {
          return { id: String(row.id || "").trim(), alias: cleanName(row.alias), hostname: cleanName(row.hostname), online: !!row.online };
        }).filter(function (d) { return !!d.id; });
        list.sort(function (a, b) { if (a.online !== b.online) return a.online ? -1 : 1; return devName(a).toLowerCase().localeCompare(devName(b).toLowerCase()); });
        cb(list.length ? list : cached, true);
      })
      .catch(function () { cb(cached, false); });
  }
  function sessionUrl(id) { return location.pathname + "#/?id=" + encodeURIComponent(id); }
  function actAddComputer() {
    var p = shell("Open another computer", "It opens in a new tab. This session stays open.");
    p.setAttribute("data-kind", "picker");
    var box = el("div", { cls: "sda-ctl-dlg" });
    var listEl = el("div", { id: "sda-ctl-pick" });
    listEl.appendChild(el("p", { cls: "sda-ctl-note" }, "Loading computers…"));
    box.appendChild(listEl);
    p.appendChild(box);
    fetchDevices(function (devs, fresh) {
      if (!document.getElementById("sda-ctl-pick")) return;
      listEl.innerHTML = "";
      var open = {};
      openSessions().forEach(function (s) { open[s.id] = s; });
      var mine = curId();
      var online = devs.filter(function (d) { return d.online; }).length;
      listEl.appendChild(el("p", { cls: "sda-ctl-note" }, devs.length ? (devs.length + " computers, " + online + " online. Tap one to open it in a new tab.") : "No computers in your list."));
      devs.forEach(function (d) {
        var isMine = d.id === mine, other = open[d.id] && !open[d.id].mine;
        var canOpen = d.online && !isMine && !other;
        var row = el(canOpen ? "a" : "div", { cls: "sda-ctl-pc" + (canOpen ? "" : " off"), "data-id": d.id });
        if (canOpen) { row.setAttribute("href", sessionUrl(d.id)); row.setAttribute("target", "_blank"); row.setAttribute("rel", "noopener"); }
        var dot = el("span", { cls: "sda-ctl-dot" }); dot.style.background = d.online ? "#16a34a" : "#9ca3af";
        var tx = el("span", { cls: "sda-ctl-pctext" });
        tx.appendChild(el("b", null, devName(d)));
        tx.appendChild(el("small", null, d.id + " · " + (isMine ? "open in this tab" : other ? "already open in another tab" : d.online ? "Online" : "Offline")));
        row.appendChild(dot); row.appendChild(tx);
        if (canOpen) {
          row.addEventListener("click", function (ev) {
            ev.stopPropagation();
            log("open_tab", d.id);
            toast("Opening " + devName(d) + " in a new tab…");
            setTimeout(closePanel, 300);
          });
        } else if (other) {
          var go = btn("Switch", "goto-" + d.id, function () { switchTo(open[d.id]); });
          go.className += " small";
          row.appendChild(go);
        }
        listEl.appendChild(row);
      });
      if (!fresh && !token()) listEl.appendChild(el("p", { cls: "sda-ctl-note" }, "Sign in on the computer list to see online status."));
    });
  }
  window.sdaAddComputer = actAddComputer;

  function switchTo(s) {
    if (!s || s.mine) { closePanel(); return; }
    askFocus(s.tab);
    closePanel();
    toast("If the browser does not switch by itself, open the tab named “SDA · " + s.name + "”.");
  }
  function actSessions() {
    var list = openSessions();
    var p = shell("Open sessions", list.length + " computer" + (list.length === 1 ? "" : "s") + " open in this browser");
    p.setAttribute("data-kind", "sessions");
    var sec = section(p, null);
    sec.g.style.gridTemplateColumns = "1fr";
    list.forEach(function (s) {
      sec.g.appendChild(btn((s.mine ? "● " : "") + s.name + " (" + s.id + ")" + (s.mine ? " · this tab" : ""), "sess-" + s.id, function () { switchTo(s); }, { pressed: s.mine }));
    });
    var add = section(p, null);
    add.g.style.gridTemplateColumns = "1fr";
    add.g.appendChild(btn("+ Open another computer", "add", actAddComputer, { cls: "primary" }));
  }
  window.sdaShowSessions = actSessions;

  // --- quick buttons ------------------------------------------------------------
  function quick(id, label, aria, fn) {
    var b = el("button", { type: "button", id: id, "aria-label": aria, title: aria }, label);
    b.addEventListener("click", function (ev) { stop(ev); fn(); });
    return b;
  }
  function updateBars() {
    var n = openSessions().length;
    ["sda-sess-btn", "sda-sess-btn2"].forEach(function (id) {
      var b = document.getElementById(id);
      if (!b) return;
      b.textContent = "⇄ " + n + " open";
      b.style.display = n > 1 ? "" : "none";
    });
  }
  // iPad: buttons in the bottom session bar.
  window.sdaExtendSessionTools = function (bar) {
    if (!bar || document.getElementById("sda-ctl-btn")) return;
    ensureStyle();
    var cad = quick("sda-cad-btn", "Ctrl+Alt+Del", "Send Ctrl+Alt+Del", actCad);
    var b = quick("sda-ctl-btn", "☰ Controls", "Remote controls", function () { openMenu(false); });
    bar.insertBefore(b, bar.firstChild);
    shieldPointer(bar);
    var fit = document.getElementById("sda-fit-btn");
    if (fit && fit.nextSibling) bar.insertBefore(cad, fit.nextSibling); else bar.appendChild(cad);
    bar.appendChild(quick("sda-add-btn", "+ Computer", "Open another computer in a new tab", actAddComputer));
    bar.appendChild(quick("sda-sess-btn", "⇄", "Open sessions", actSessions));
    bar.appendChild(quick("sda-disc-btn", "Disconnect", "Disconnect from this computer", actDisconnect));
    updateBars();
  };
  // Desktop browsers: a floating bar at the top left.
  function ensureDesktopBar(want) {
    var bar = document.getElementById("sda-ctl-dbar");
    if (!want) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    if (bar || !document.body) return;
    ensureStyle();
    bar = el("div", { id: "sda-ctl-dbar" });
    var fab = quick("sda-ctl-fab", "☰ Controls", "Remote controls", function () { openMenu(false); });
    bar.appendChild(fab);
    bar.appendChild(quick("sda-add-btn2", "+ Computer", "Open another computer in a new tab", actAddComputer));
    bar.appendChild(quick("sda-sess-btn2", "⇄", "Open sessions", actSessions));
    bar.appendChild(quick("sda-disc-btn2", "Disconnect", "Disconnect from this computer", actDisconnect));
    shieldPointer(bar);
    document.body.appendChild(bar);
    updateBars();
  }

  // Mouse moves made over our own buttons/menu (desktop browsers hover) must
  // not move or click the remote mouse; the page-level Flutter listener sees
  // them too, so drop those at the bridge.
  var OUR_UI = "#sda-ctl-panel,#sda-ctl-shade,#sda-ctl-dbar,#sda-session-tools,#sda-ctl-toast";
  var lastPtrOurs = false;
  ["pointermove", "pointerdown", "pointerup", "pointerover", "pointerout", "pointerenter", "pointerleave", "mousemove", "mousedown", "mouseup", "mouseover", "mouseout", "touchstart", "touchend"].forEach(function (t) {
    window.addEventListener(t, function (ev) {
      try { lastPtrOurs = !!(ev.target && ev.target.closest && ev.target.closest(OUR_UI)); } catch (e) { lastPtrOurs = false; }
    }, true);
  });
  function hoverOurs() {
    try {
      var h = document.querySelectorAll(":hover");
      var last = h.length ? h[h.length - 1] : null;
      return !!(last && last.closest && last.closest(OUR_UI));
    } catch (e) { return false; }
  }
  function wrapBridge() {
    var orig = window.setByName;
    if (!orig || orig.__sdaCtl || orig.__sdaStub) return;
    var w = function (name, value) {
      if (name === "send_mouse" && (lastPtrOurs || panelOpen || hoverOurs()) && !/"type":\s*"up"/.test(String(value))) { stats.droppedMouse = (stats.droppedMouse || 0) + 1; return; }
      return orig.apply(this, arguments);
    };
    w.__sdaCtl = true;
    if (orig.__sdaStab) w.__sdaStab = true;
    if (orig.__sdaStatus) w.__sdaStatus = true;
    window.setByName = w;
  }

  var lastHb = 0;
  function tick() {
    try { wrapBridge(); } catch (eW) {}
    try {
      var live = inSession();
      var bar = document.getElementById("sda-session-tools");
      if (bar) window.sdaExtendSessionTools(bar);
      ensureDesktopBar(live && !bar && !isIpadUi());
      if (!live && panelOpen) closePanel();
      maybeOpenPending();
      if (Date.now() - lastHb > 3000) { lastHb = Date.now(); heartbeat(); updateBars(); }
      updateTitle();
    } catch (e) {}
  }
  setInterval(tick, 500);
  document.addEventListener("fullscreenchange", function () { setTimeout(render, 100); });
  document.addEventListener("webkitfullscreenchange", function () { setTimeout(render, 100); });
  window.sdaOpenControls = function () { openMenu(false); };
})();
