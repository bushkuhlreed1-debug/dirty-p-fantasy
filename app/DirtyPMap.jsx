"use client";

import { useEffect, useRef } from "react";

const locations = [
  // TEXAS
  { name: "New Braunfels", state: "TX", lat: 29.703, lng: -98.125 },
  { name: "San Marcos", state: "TX", lat: 29.883, lng: -97.941 },
  { name: "Kyle", state: "TX", lat: 29.989, lng: -97.877 },
  { name: "Iowa Colony", state: "TX", lat: 29.382, lng: -95.956 },
  { name: "Rosharon", state: "TX", lat: 29.354, lng: -95.461 },
  { name: "Houston", state: "TX", lat: 29.760, lng: -95.370 },
  { name: "Pearland", state: "TX", lat: 29.563, lng: -95.286 },
  { name: "West Columbia", state: "TX", lat: 29.144, lng: -95.646 },
  { name: "College Station", state: "TX", lat: 30.628, lng: -96.334 },
  { name: "Huntsville", state: "TX", lat: 30.723, lng: -95.550 },
  { name: "Greenville", state: "TX", lat: 33.138, lng: -96.111 },
  { name: "Rockdale", state: "TX", lat: 30.655, lng: -97.001 },
  { name: "Richardson", state: "TX", lat: 32.948, lng: -96.729 },
  { name: "Fort Worth", state: "TX", lat: 32.755, lng: -97.330 },

  // ARKANSAS
  { name: "Fayetteville", state: "AR", lat: 36.063, lng: -94.160 },
  { name: "Fort Smith", state: "AR", lat: 35.385, lng: -94.398 },

  // NORTH CAROLINA
  { name: "Charlotte", state: "NC", lat: 35.227, lng: -80.843 },

  // VIRGINIA
  {
    name: "Somewhere in Virginia",
    state: "VA",
    lat: 37.540,
    lng: -78.500,
  },

  // KENTUCKY
  { name: "Louisville", state: "KY", lat: 38.253, lng: -85.759 },

  // ARIZONA
  { name: "Tucson", state: "AZ", lat: 32.222, lng: -110.926 },

  // CALIFORNIA
  { name: "Palmdale", state: "CA", lat: 34.580, lng: -118.117 },

  // DELAWARE
  { name: "Delaware", state: "DE", lat: 39.158, lng: -75.524 },
];

export default function DirtyPMap() {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadLeaflet = async () => {
      // Load Leaflet CSS
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");

        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href =
          "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

        document.head.appendChild(link);
      }

      // Load Leaflet JavaScript
      if (!window.L) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector(
            'script[data-leaflet="true"]'
          );

          if (existing) {
            existing.addEventListener("load", resolve);
            existing.addEventListener("error", reject);
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

      if (cancelled || !mapRef.current || !window.L) {
        return;
      }

      const L = window.L;

      // Prevent duplicate map initialization
      if (mapInstance.current) {
        return;
      }

      // Create map
      const map = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
      });

      mapInstance.current = map;

      // Center on the United States
      map.setView([38.5, -96], 4);

      // Dark map tiles
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          attribution:
            '&copy; OpenStreetMap contributors &copy; CARTO',
        }
      ).addTo(map);

      // Custom gold marker
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

      // Add every location
      locations.forEach((location) => {
        const marker = L.marker(
          [location.lat, location.lng],
          {
            icon: markerIcon,
          }
        ).addTo(map);

        marker.bindPopup(`
          <div class="dirty-p-popup">
            <strong>${location.name}</strong>
            <span>${location.state}</span>
          </div>
        `);
      });

      // Fit all locations into view
      const bounds = L.latLngBounds(
        locations.map((location) => [
          location.lat,
          location.lng,
        ])
      );

      map.fitBounds(bounds, {
        padding: [45, 45],
        maxZoom: 5,
      });

      // Force correct sizing after render
      setTimeout(() => {
        if (mapInstance.current) {
          mapInstance.current.invalidateSize();
        }
      }, 200);
    };

    loadLeaflet();

    return () => {
      cancelled = true;

      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  return (
    <section className="dirty-p-map">

      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="dirty-p-map-header">

        <div>

          <p className="eyebrow">
            THE LEAGUE HAS MOVED
          </p>

          <h2>
            The Dirty P Road Map
          </h2>

          <p className="dirty-p-map-subtitle">
            One league. A ridiculous number of addresses.
          </p>

        </div>

        <div className="dirty-p-map-count">

          <div>
            <strong>8</strong>
            <span>STATES</span>
          </div>

          <div>
            <strong>21</strong>
            <span>LOCATIONS</span>
          </div>

        </div>

      </div>


      {/* =====================================================
          MAP
          ===================================================== */}

      <div className="dirty-p-real-map">

        <div
          ref={mapRef}
          className="dirty-p-leaflet-map"
        />

      </div>


      {/* =====================================================
          MAP FOOTER
          ===================================================== */}

      <div className="dirty-p-map-footer">

        <span>
          Different cities.
        </span>

        <strong>
          Same degenerates.
        </strong>

      </div>

    </section>
  );
}
