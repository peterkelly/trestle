(cons
 "before-"
 (cons
  (letrec
      ((value (input test)))
    (+ 1000 value))
  (cons "-after" '())))
