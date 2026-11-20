import numpy as np, glob, time
from scipy.ndimage import percentile_filter, uniform_filter, median_filter, distance_transform_edt
B="/private/tmp/claude-501/-Users-thanutjunnim--claude-spares-spare-xBaqIq/7637eb5c-4795-426a-9f74-9f0ed54e1eb4/scratchpad/"
DB=[];M=[]
for f in sorted(glob.glob(B+"out3/y*.npz")):
    z=np.load(f,allow_pickle=True); DB.append(z["db"].astype("float32")); M.append(z["months"])
DB=np.concatenate(DB);M=np.concatenate(M)
ok=np.isfinite(DB); wtr=ok&(DB<-15); wet=(M>=8)&(M<=11); dry=M<=3
perm=(wtr[dry].sum(0)/np.maximum(ok[dry].sum(0),1))>0.5
fw=wtr[wet].sum(0)/np.maximum(ok[wet].sum(0),1)
L=np.load(B+"layers.npz"); dem0=L["dem"].astype("float32"); wc=L["wc"]
def auc(score,y):
    # AUC of 'score' (lower REM => flooded) via rank-sum
    from scipy.stats import rankdata
    r=rankdata(score); n1=y.sum(); n0=len(y)-n1
    return (r[y].sum()-n1*(n1+1)/2)/(n1*n0)
evalmask=~perm&((wc==40)|(wc==30)|(wc==50))     # land where flooding is observable
y=(fw>0.1)[evalmask]; print("eval px",evalmask.sum(),"flooded share",y.mean().round(3))
def bare(d):
    bad=(wc==50)|(wc==10)
    _,(ri,ci)=distance_transform_edt(bad,return_indices=True); return d[ri,ci]
res={}
# old HAND
dem=median_filter(dem0,5); d,(ri,ci)=distance_transform_edt(~perm,return_indices=True); hand=dem-dem[ri,ci]
res["old HAND"]=(hand,); 
print(f"{'variant':34s} AUC(low=flooded)")
print(f"{'old HAND (nearest river px)':34s} {1-auc(hand[evalmask],y):.3f}")
for name,base in [("raw DEM",dem0),("median5 DEM",dem),("bare-earth fill",median_filter(bare(dem0),5))]:
    for w in (25,51,101):
        t=time.time(); lo=percentile_filter(base,10,size=w); lo=uniform_filter(lo,w//2|1)
        rem=base-lo; res[f"{name}|{w}"]=rem
        print(f"{name+' win'+str(w):34s} {1-auc(rem[evalmask],y):.3f}  ({time.time()-t:.0f}s)",flush=True)
print("plain elevation (no base)         ",f"{1-auc(dem[evalmask],y):.3f}")
np.savez(B+"rem_variants.npz",**{k.replace("|","_"):v for k,v in res.items() if k!="old HAND"})
