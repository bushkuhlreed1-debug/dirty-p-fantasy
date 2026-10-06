"use client";

import {
  useEffect,
  useRef,
} from "react";


// =========================================================
// CURRENT DIRTY P OWNER LOCATIONS
//
// CITY-LEVEL ONLY
// NO EXACT ADDRESSES
// =========================================================

const locations = [

  {
    name: "New Braunfels",
    state: "TX",
    lat: 29.703,
    lng: -98.125,
  },

  {
    name: "Fort Worth",
    state: "TX",
    lat: 32.755,
    lng: -97.330,
  },

  {
    name: "Keller",
    state: "TX",
    lat: 32.934,
    lng: -97.229,
  },

  {
    name: "Frisco",
    state: "TX",
    lat: 33.151,
    lng: -96.824,
  },

  {
    name: "Rockdale",
    state: "TX",
    lat: 30.655,
    lng: -97.001,
  },

  {
    name: "Houston",
    state: "TX",
    lat: 29.760,
    lng: -95.370,
  },

  {
    name: "Iowa Colony",
    state: "TX",
    lat: 29.482,
    lng: -95.415,
  },

  {
    name: "Charlotte",
    state: "NC",
    lat: 35.227,
    lng: -80.843,
  },

  {
    name: "Milton",
    state: "DE",
    lat: 38.777,
    lng: -75.310,
  },

];


// =========================================================
// COUNTS
// =========================================================

const stateCount =
  new Set(
    locations.map(
      (location) => location.state
    )
  ).size;


export default function DirtyPMap() {

  const mapRef =
    useRef(null);

  const mapInstance =
    useRef(null);


  useEffect(() => {

    let cancelled = false;


    async function loadMap() {

      // =====================================================
      // LOAD LEAFLET CSS
      // =====================================================

      if (
        !document.getElementById(
          "leaflet-css"
        )
      ) {

        const link =
          document.createElement(
            "link"
          );

        link.id =
          "leaflet-css";

        link.rel =
          "stylesheet";

        link.href =
          "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

        document.head.appendChild(
          link
        );

      }


      // =====================================================
      // LOAD LEAFLET
      // =====================================================

      if (!window.L) {

        await new Promise(
          (
            resolve,
            reject
          ) => {

            const existing =
              document.querySelector(
                'script[data-leaflet="true"]'
              );


            if (existing) {

              existing.addEventListener(
                "load",
                resolve
              );

              existing.addEventListener(
                "error",
                reject
              );

              return;

            }


            const script =
              document.createElement(
                "script"
              );


            script.src =
              "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";


            script.async =
              true;


            script.dataset.leaflet =
              "true";


            script.onload =
              resolve;


            script.onerror =
              reject;


            document.body.appendChild(
              script
            );

          }
        );

      }


      if (
        cancelled ||
        !mapRef.current ||
        !window.L
      ) {

        return;

      }


      const L =
        window.L;


      // =====================================================
      // PREVENT DUPLICATE MAP
      // =====================================================

      if (
        mapInstance.current
      ) {

        return;

      }


      // =====================================================
      // CREATE MAP
      // =====================================================

      const map =
        L.map(
          mapRef.current,
          {

            zoomControl:
              true,

            scrollWheelZoom:
              false,

            attributionControl:
              true,

          }
        );


      mapInstance.current =
        map;


      // =====================================================
      // MAP TILES
      // =====================================================

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {

          maxZoom:
            19,

          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',

        }
      ).addTo(
        map
      );


      // =====================================================
      // DIRTY P MARKER
      // =====================================================

      const markerIcon =
        L.divIcon({

          className:
            "dirty-p-marker-wrapper",

          html: `
            <div class="dirty-p-marker">

              <div
                class="dirty-p-marker-pulse"
              ></div>

              <div
                class="dirty-p-marker-dot"
              ></div>

            </div>
          `,

          iconSize:
            [22, 22],

          iconAnchor:
            [11, 11],

          popupAnchor:
            [0, -12],

        });


      // =====================================================
      // ADD CURRENT OWNER LOCATIONS
      // =====================================================

      locations.forEach(
        (location) => {

          const marker =
            L.marker(
              [
                location.lat,
                location.lng,
              ],
              {
                icon:
                  markerIcon,
              }
            ).addTo(
              map
            );


          marker.bindPopup(`
            <div class="dirty-p-popup">

              <strong>
                ${location.name}
              </strong>

              <span>
                ${location.state}
              </span>

            </div>
          `);

        }
      );


      // =====================================================
      // FIT MAP TO CURRENT OWNERS
      // =====================================================

      const bounds =
        L.latLngBounds(

          locations.map(
            (location) => [

              location.lat,

              location.lng,

            ]
          )

        );


      map.fitBounds(
        bounds,
        {

          padding:
            [45, 45],

          maxZoom:
            5,

        }
      );


      // =====================================================
      // FIX MAP SIZE
      // =====================================================

      setTimeout(
        () => {

          if (
            mapInstance.current
          ) {

            mapInstance.current
              .invalidateSize();

          }

        },
        300
      );

    }


    loadMap();


    return () => {

      cancelled =
        true;


      if (
        mapInstance.current
      ) {

        mapInstance.current.remove();

        mapInstance.current =
          null;

      }

    };

  }, []);


  // =========================================================
  // PAGE
  // =========================================================

  return (

    <section className="dirty-p-map">


      {/* ===================================================
          HEADER
          =================================================== */}

      <div className="dirty-p-map-header">

        <div>

          <p className="eyebrow">
            CURRENT OWNERS
          </p>

          <h2>
            Where the League Lives
          </h2>

          <p className="dirty-p-map-subtitle">
            The current Dirty P owners across the country.
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
              OWNERS
            </span>

          </div>

        </div>

      </div>


      {/* ===================================================
          MAP
          =================================================== */}

      <div className="dirty-p-real-map">

        <div
          ref={mapRef}
          className="dirty-p-leaflet-map"
        />

      </div>


      {/* ===================================================
          FOOTER
          =================================================== */}

      <div className="dirty-p-map-footer">

        <span>
          9 current owners.
        </span>

        <strong>
          3 states.
        </strong>

      </div>

    </section>
  );
}
