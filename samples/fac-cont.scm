(letrec
    ((sub (lambda (a b cont fail) (cont (- a b) fail)))
     (mul (lambda (a b cont fail) (cont (* a b) fail)))
     (eq (lambda (a b cont fail) (cont (eqv? a b) fail)))
     (fac (lambda (n cont fail)
            (eq n 1
                (lambda (eq-result fail)
                (if eq-result
                    (cont 1 fail)
                    (sub n 1
                         (lambda (sub-result fail)
                         (fac sub-result
                              (lambda (fac-result fail)
                                (mul n fac-result cont fail))
                              fail
                              ))
                         fail
                         )))
                fail))))
  (fac 5
       (lambda (result fail)
         (display "result = ")
         (display result)
         (newline)
         (newline))
       (lambda (error fail)
         (display "error: ")
         (display error)
         (newline)
         (newline))
       ))
