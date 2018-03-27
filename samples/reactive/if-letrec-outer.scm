(letrec
    ((value (input test)))
  (cons
   "before-"
   (cons
    (if (eqv? (mod value 2) 0)
        (cons "even" (cons value '()))
        (cons "odd" (cons value '())))
    (cons "-after" '()))))
