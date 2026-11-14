import numpy as np, pystac_client, planetary_computer, odc.stac, warnings, time
from affine import Affine
warnings.filterwarnings("ignore")
B="/private/tmp/claude-501/-Users-thanutjunnim--claude-spares-spare-xBaqIq/7637eb5c-4795-426a-9f74-9f0ed54e1eb4/scratchpad/"
z=np.load(B+"out3/y2018.npz",allow_pickle=True); tr=Affine(*z["transform"]); H,W=z["db"].shape[1:]
bbox=[100.50,14.15,100.70,14.40]
cat=pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1")
res={}
for coll,band,kw in [("cop-dem-glo-30","data",dict(dtype="float32")),("esa-worldcover","map",dict(dtype="uint8"))]:
    t=time.time()
    its=list(cat.search(collections=[coll],bbox=bbox).items())
    if coll=="esa-worldcover": its=[i for i in its if i.properties.get("esa_worldcover:product_version")=="2.0.0" or "2021" in i.id] or its
    its=[planetary_computer.sign(i) for i in its][:4]
    ds=odc.stac.load(its,bands=[band],bbox=bbox,crs="EPSG:32647",resolution=80,resampling="average" if coll!="esa-worldcover" else "mode",**kw)
    a=ds[band].isel(time=0).values if "time" in ds[band].dims else ds[band].values
    print(coll,len(its),a.shape,round(time.time()-t),"s", "min/max",np.nanmin(a),np.nanmax(a),flush=True)
    res[coll]=a
np.savez(B+"layers.npz",dem=res["cop-dem-glo-30"],wc=res["esa-worldcover"],shape=np.array([H,W]))
print("SAR grid",H,W)
