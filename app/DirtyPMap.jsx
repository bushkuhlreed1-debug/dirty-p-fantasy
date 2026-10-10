"use client";

import { useEffect, useRef } from "react";

const locations = [
  {
    city: "Houston",
    state: "TX",
    lat: 29.7604,
    lng: -95.3698,
  },
  {
    city: "Iowa Colony",
    state: "TX",
    lat: 29.4416,
    lng: -95.4155,
  },
  {
    city: "Rockdale",
    state: "TX",
    lat: 30.6552,
    lng: -97.0014,
  },
  {
    city: "New Braunfels",
    state: "TX",
    lat: 29.703,
    lng: -98.1245,
  },
  {
    city: "Fort Worth",
    state: "TX",
    lat: 32.7555,
    lng: -97.3308,
  },
  {
    city: "Keller",
    state: "TX",
    lat: 32.9343,
    lng: -97.2293,
  },
  {
    city: "Frisco",
    state: "TX",
    lat: 33.1507,
    lng: -96.8236,
  },
  {
    city: "Charlotte",
    state: "NC",
    lat: 35.2271,
    lng: -80.8431,
  },
  {
    city: "Milton",
    state: "DE",
    lat: 38.7776,
    lng: -75.3099,
  },
];

export default function DirtyPMap() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let resizeTimeout;

    async function loadMap() {
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");

        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href =
          "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

        document.head.appendChild(link);
      }

      if (!window.L) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector(
            'script[data-leaflet="true"]'
          );

          if (existing) {
            if (window.L) {
              resolve();
              return;
            }

            existing.addEventListener("load", resolve, {
              once: true,
            });

            existing.addEventListener("error", reject, {
              once: true,
            });

            return;
          }

          const script = document.createElement("script");

          script.src =
            "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

          script.async = true;
          script.dataset.leaflet = "true";

          script.onload = resolve;
          script.onerror = reject;

          document.body.appendChild(script);
        });
      }

      if (
        cancelled ||
        !mapRef.current ||
        !window.L
      ) {
        return;
      }

      if (mapInstance.current) {
        return;
      }

      const L = window.L;

      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
      });

      mapInstance.current = map;

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }
      ).addTo(map);

      const markerIcon = L.divIcon({
        className: "dirty-p-marker-wrapper",

        html: `
          <div class="dirty-p-marker">
            <div class="dirty-p-marker-pulse"></div>
            <div class="dirty-p-marker-dot"></div>
          </div>
        `,

        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
      });

      locations.forEach((location) => {
        const marker = L.marker(
          [
            location.lat,
            location.lng,
          ],
          {
            icon: markerIcon,
          }
        ).addTo(map);

        marker.bindPopup(`
          <div class="dirty-p-popup">
            <strong>
              ${location.city}, ${location.state}
            </strong>
          </div>
        `);
      });

      const bounds = L.latLngBounds(
        locations.map((location) => [
          location.lat,
          location.lng,
        ])
      );

      map.fitBounds(bounds, {
        padding: [55, 55],
        maxZoom: 5,
      });

      resizeTimeout = setTimeout(() => {
        if (mapInstance.current) {
          mapInstance.current.invalidateSize();
        }
      }, 250);
    }

    loadMap().catch((error) => {
      console.error(
        "Unable to load Dirty P map:",
        error
      );
    });

    return () => {
      cancelled = true;

      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  const stateCount = new Set(
    locations.map((location) => location.state)
  ).size;

  return (
    <section className="dirty-p-map">

      <div className="dirty-p-map-header">

        <div>

          <p className="eyebrow">
            LEAGUE FOOTPRINT
          </p>

          <h2>
            Where the League Lives
          </h2>

          <p className="dirty-p-map-subtitle">
            Dirty P currently spans Texas,
            North Carolina and Delaware.
          </p>

        </div>

        <div className="dirty-p-map-count">

          <div>
            <strong>
              {stateCount}
            </strong>

            <span>
              STATES
            </span>
          </div>

          <div>
            <strong>
              {locations.length}
            </strong>

            <span>
              LOCATIONS
            </span>
          </div>

        </div>

      </div>

      <div className="dirty-p-real-map">

        <div
          ref={mapRef}
          className="dirty-p-leaflet-map"
        />

      </div>

      <div className="dirty-p-map-footer">

        <span>
          Current league footprint
        </span>

        <strong>
          · Est. 2014
        </strong>

      </div>

    </section>
  );
}
