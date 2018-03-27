(letrec
    ((value (input test)))
  (cons
   "before-"
   (cons
    (+ 1000 value)
    (cons "-after" '()))))
