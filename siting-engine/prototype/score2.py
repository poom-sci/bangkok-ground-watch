import numpy as np, glob, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.ndimage import median_filter, uniform_filter
from rasterio.warp import transform
from affine import Affine
B="/private/tmp/claude-501/-Users-thanutjunnim--claude-spares-spare-xBaqIq/7637eb5c-4795-426a-9f74-9f0ed54e1eb4/scratchpad/"
DB=[];M=[]
for f in sorted(glob.glob(B+"out3/y*.npz")):
    z=np.load(f,allow_pickle=True); DB.append(z["db"].astype("float32")); M.append(z["months"]); tr=Affine(*z["transform"])
DB=np.concatenate(DB);M=np.concatenate(M);T,H,W=DB.shape
ok=np.isfinite(DB); wtr=ok&(DB<-15); wet=(M>=8)&(M<=11); dry=M<=3
perm=(wtr[dry].sum(0)/np.maximum(ok[dry].sum(0),1))>0.5
fw=wtr[wet].sum(0)/np.maximum(ok[wet].sum(0),1)
L=np.load(B+"layers.npz"); dem0=L["dem"].astype("float32"); wc=L["wc"]
def auc_low(score,y):
    from scipy.stats import rankdata
    r=rankdata(score); n1=y.sum(); n0=len(y)-n1; return 1-(r[y].sum()-n1*(n1+1)/2)/(n1*n0)
ev=~perm&((wc==40)|(wc==30)|(wc==50)); y=(fw>0.1)[ev]
for k in (5,9,15): 
    e=uniform_filter(median_filter(dem0,k),3); print("median",k,"AUC",round(auc_low(e[ev],y),3))
elev=uniform_filter(median_filter(dem0,9),3)
print("elev pctl 5/50/95:",np.percentile(elev,[5,50,95]).round(1))
# empirical P(flooded | elevation bin), monotone (flooding should not increase with height)
edges=np.arange(np.floor(elev[ev].min()),np.ceil(elev[ev].max())+0.5,0.5); idx=np.digitize(elev,edges)
p=np.array([ (fw[(idx==i)&ev]>0.1).mean() if ((idx==i)&ev).sum()>200 else np.nan for i in range(1,len(edges)+1)])
# fill sparse bins and enforce non-increasing with height (cumulative min)
for i in range(len(p)):
    if np.isnan(p[i]): p[i]=p[i-1] if i>0 else np.nanmax(p)
p=np.minimum.accumulate(p)
for e,pp in zip(edges,p): 
    n=((idx==np.digitize(e,edges))&ev).sum()
    if n>200: print(f"  elev {e:4.1f}-{e+0.5:4.1f} m: n={n:6d}  P(flooded>10%)={pp:.3f}")
pf=p[np.clip(idx-1,0,len(p)-1)]
f_height=1-pf/pf.max()
f_flood=np.clip(1-fw/0.3,0,1)
score=100*(0.7*f_flood+0.3*f_height)
excl=(wc==10)|(wc==80)|(wc==90)|perm
score=np.where(excl,np.nan,score)
np.save(B+"score_final.npy",score)
print("score pctl 5/50/95:",np.nanpercentile(score,[5,50,95]).round(0))
pts={"Rojana (approx)":(100.627,14.318),"Bang Pa-in IE (approx)":(100.578,14.187)}
for n,(lo,la) in pts.items():
    x,yy=transform("EPSG:4326","EPSG:32647",[lo],[la]); c,r=~tr*(x[0],yy[0]); r=int(r);c=int(c);k=25; sl=(slice(r-k,r+k+1),slice(c-k,c+k+1))
    print(f"{n}: score {np.nanmean(score[sl]):.0f} | elev {elev[sl].mean():.1f} m | share<50: {np.nanmean(score[sl]<50)*100:.0f}%")
ext=[tr.c,tr.c+tr.a*W,tr.f+tr.e*H,tr.f]
fig,ax=plt.subplots(1,3,figsize=(17,6.3))
im=ax[0].imshow(np.where(perm,np.nan,elev),cmap="terrain",vmin=1,vmax=8,extent=ext); ax[0].set_title("Smoothed elevation (m), Copernicus DEM"); plt.colorbar(im,ax=ax[0],fraction=0.04)
ax[1].imshow(np.where(perm,np.nan,fw),cmap="Blues",vmin=0,vmax=0.6,extent=ext); ax[1].set_title("SAR wet-season water frequency")
im=ax[2].imshow(score,cmap="RdYlGn",vmin=0,vmax=100,extent=ext); ax[2].set_title("Site suitability (0.7 SAR flood + 0.3 elevation)\nblank = tree/water/wetland excluded"); plt.colorbar(im,ax=ax[2],fraction=0.04)
for n,(lo,la) in pts.items():
    x,yy=transform("EPSG:4326","EPSG:32647",[lo],[la])
    for a in ax: a.plot(x[0],yy[0],"k*",ms=12)
for a in ax: a.set_xticks([]);a.set_yticks([])
plt.tight_layout(); plt.savefig("/Users/thanutjunnim/workspace/999_solsat/solsat/site_suitability_ayutthaya.png",dpi=100)
