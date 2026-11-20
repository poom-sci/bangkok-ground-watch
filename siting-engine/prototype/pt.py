import numpy as np, glob
from rasterio.warp import transform
from affine import Affine
from scipy.ndimage import median_filter, uniform_filter
B="/private/tmp/claude-501/-Users-thanutjunnim--claude-spares-spare-xBaqIq/7637eb5c-4795-426a-9f74-9f0ed54e1eb4/scratchpad/"
DB=[];M=[];D=[]
for f in sorted(glob.glob(B+"out3/y*.npz")):
    z=np.load(f,allow_pickle=True); DB.append(z["db"].astype("float32")); M.append(z["months"]); D+=list(z["dates"]); tr=Affine(*z["transform"])
DB=np.concatenate(DB);M=np.concatenate(M);D=np.array(D)
x,y=transform("EPSG:4326","EPSG:32647",[100.60],[14.275]); c,r=~tr*(x[0],y[0]); r=int(r);c=int(c)
print("pixel",r,c)
sc=np.load(B+"score_final.npy"); L=np.load(B+"layers.npz"); elev=uniform_filter(median_filter(L["dem"].astype("float32"),9),3)
ok=np.isfinite(DB); wtr=ok&(DB<-15); wet=(M>=8)&(M<=11)
for k in (0,6):
    sl=(slice(r-k,r+k+1),slice(c-k,c+k+1)); fw=wtr[wet][:,sl[0],sl[1]].mean()
    print(f"window ±{k}px (~{k*80} m): wet-season water freq {fw:.2f} | elev {elev[sl].mean():.1f} m | score {np.nanmean(sc[sl]):.0f} | worldcover modal {np.bincount(L['wc'][sl].ravel()).argmax()}")
ser=DB[:,r,c]; 
for d,m,v in zip(D,M,ser):
    if m in (9,10,11) and d[:4] in ("2021","2022","2025"): print(d,round(float(v),1),end=" | ")
