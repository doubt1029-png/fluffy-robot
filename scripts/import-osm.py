"""Extract mapped Korean toilets and nearby place labels from a Geofabrik OSM PBF."""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import osmium

pbf, output = (str(Path(name).resolve()) for name in sys.argv[1:3])
labels = defaultdict(list)
facilities = []

def cell(lat, lng):
    return math.floor(lat * 10), math.floor(lng * 10)

def point(lat, lng):
    return 32.9 <= lat <= 38.7 and 124.5 <= lng <= 132

for item in osmium.FileProcessor(pbf).with_filter(
    osmium.filter.KeyFilter("amenity", "place").enable_for(osmium.osm.NODE)
):
    if not isinstance(item, osmium.osm.Node) or not item.location.valid():
        continue
    lat, lng = item.location.lat, item.location.lon
    if not point(lat, lng):
        continue
    name = item.tags.get("name:ko") or item.tags.get("name")
    if name and item.tags.get("place") in {"city", "town", "village", "suburb", "quarter", "neighbourhood"}:
        labels[cell(lat, lng)].append((lat, lng, name, item.tags["place"]))

for item in osmium.FileProcessor(pbf).with_locations("flex_mem").with_filter(
    osmium.filter.TagFilter(("amenity", "toilets"))
):
    if isinstance(item, osmium.osm.Node):
        locations = [item.location]
        prefix = "n"
    elif isinstance(item, osmium.osm.Way):
        locations = [node.location for node in item.nodes if node.location.valid()]
        if len(locations) > 1 and locations[0] == locations[-1]:
            locations.pop()
        prefix = "w"
    else:
        continue
    if not locations or not all(location.valid() for location in locations):
        continue
    lat = sum(location.lat for location in locations) / len(locations)
    lng = sum(location.lon for location in locations) / len(locations)
    if not point(lat, lng):
        continue
    tags = item.tags
    row, col = cell(lat, lng)
    nearby = sorted(
        ((lat - y) ** 2 + ((lng - x) * 0.8) ** 2, name, kind)
        for dy in range(-2, 3)
        for dx in range(-2, 3)
        for y, x, name, kind in labels[row + dy, col + dx]
    )
    areas = [name for _, name, _ in nearby[:4]]
    areas.extend(name for separation, name, kind in nearby if kind in {"city", "town"} and separation < 0.016)
    areas = list(dict.fromkeys(areas))[:12]
    address = " ".join(filter(None, (tags.get("addr:city"), tags.get("addr:district"),
                                      tags.get("addr:street"), tags.get("addr:housenumber"))))
    access = tags.get("access")
    facilities.append({
        "id": "osm-" + prefix + str(item.id),
        "name": tags.get("name:ko") or tags.get("name") or "화장실",
        "address": address or (" · ".join(areas[:2]) + " 인근" if areas else ""),
        "area": " ".join(areas),
        "lat": round(lat, 6), "lng": round(lng, 6),
        "entry": "unknown", "code": "unknown", "type": "unknown",
        "public": {"yes": "yes", "public": "yes", "no": "no", "private": "no", "customers": "no"}.get(access, "unknown"),
        "hours": tags.get("opening_hours", ""),
        "source": "osm"
    })
with open(output, "w", encoding="utf-8") as handle:
    json.dump(facilities, handle, ensure_ascii=False, separators=(",", ":"))
    handle.write("\n")
print(f"Extracted {len(facilities)} toilets")
