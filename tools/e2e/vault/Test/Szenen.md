# Szenen-Test

Reisekarte aus der Leaflet-Karte in „Reise“ (Bild und Marker):

```szene
name: Seekarte
leaflet: süd-map
```

Kampfszene mit Raster und Tokens aus „Hinterhalt an Deck“:

```szene
name: Sabotage an Deck
karte: "[[Deck.png]]"
raster: { typ: quadrat, größe: 50, schritt: 1 }
nscs: ["[[Hinterhalt an Deck#Die Viper]]", "[[Hinterhalt an Deck#Vollstrecker]]", "[[Hinterhalt an Deck#Schattenweber]]"]
licht: nacht
nebel: ja
```

Verweis: [[Szenen#Sabotage an Deck]]
