export const EXTRA_FIELDS_CONFIG = {
  client: [
    { name: "buyer_name", label: "Pirkėjo pavadinimas", search: "/autocomplete/clients/", type: "client" },
    { name: "buyer_id", label: "Pirkėjo įmonės kodas", search: "/autocomplete/clients/", type: "client" },
    { name: "buyer_vat_code", label: "Pirkėjo PVM kodas", search: "/autocomplete/clients/", type: "client" },
    { name: "seller_name", label: "Pardavėjo pavadinimas", search: "/autocomplete/clients/", type: "client" },
    { name: "seller_id", label: "Pardavėjo įmonės kodas", search: "/autocomplete/clients/", type: "client" },
    { name: "seller_vat_code", label: "Pardavėjo PVM kodas", search: "/autocomplete/clients/", type: "client" },
  ],
  product: [
    { name: "prekes_pavadinimas", label: "Prekės pavadinimas", search: "/autocomplete/products/", type: "product" },
    { name: "prekes_kodas", label: "Prekės kodas", search: "/autocomplete/products/", type: "product" },
    { name: "prekes_barkodas", label: "Prekės barkodas", search: "/autocomplete/products/", type: "product" },
    // и другие product-поля по необходимости
  ]
};
