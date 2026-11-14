import numpy as np, pystac_client, planetary_computer, odc.stac, warnings, os, time
warnings.filterwarnings("ignore")
S=os.path.dirname(os.path.abspath(__file__)); OUT=S+"/out3"
cat = pystac_client.Client.open("https://planetarycomputer.microsoft.com/api/stac/v1")
bbox=[100.50,14.15,100.70,14.40]; TH=-18.0
for yr in range(2017,2026):
    fn=f"{OUT}/y{yr}.npz"
    if os.path.exists(fn): continue
    t0=time.time()
    allit=[i for i in cat.search(collections=["sentinel-1-rtc"],bbox=bbox,datetime=f"{yr}-01-01/{yr}-12-31").items()
           if i.properties.get("sat:orbit_state")=="descending" and i.properties.get("sat:relative_orbit")==62]
    allit.sort(key=lambda i:i.datetime)
    sel=[i for i in allit if 8<=i.datetime.month<=11]
    for m in (2,3):
        mm=[i for i in allit if i.datetime.month==m]
        if mm: sel.append(mm[0])
    sel=[planetary_computer.sign(i) for i in sel]
    ds=odc.stac.load(sel,bands=["vv"],bbox=bbox,crs="EPSG:32647",resolution=80,resampling="average",dtype="float32",
                     chunks={"x":512,"y":512,"time":1},groupby="solar_day")
    vv=ds.vv.compute(scheduler="threads",num_workers=8).values
    ok=np.isfinite(vv)&(vv>0)
    db=np.where(ok,10*np.log10(np.where(ok,vv,1)),np.nan)
    water=ok&(db<TH)
    months=ds.time.dt.month.values; dates=ds.time.dt.strftime("%Y-%m-%d").values
    gb=ds.odc.geobox
    np.savez(fn,db=db.astype("float16"),months=months,dates=dates,transform=np.array(gb.transform)[:6],crs=str(gb.crs))
    print(yr,len(sel),vv.shape,round(time.time()-t0),"s",flush=True)
print("done")
